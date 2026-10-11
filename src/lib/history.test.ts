import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "./brand";
import {
  exportTestHistory,
  HISTORY_SCHEMA_VERSION,
  HISTORY_STORE_NAME,
  KEY_STATS_STORE_NAME,
  LEARN_PROGRESS_STORE_NAME,
  SETTINGS_STORE_NAME,
  importTestHistory,
  openTestHistoryDatabase,
  readTestHistory,
  readAdaptiveState,
  saveAdaptiveState,
  saveTestHistory,
  type TestHistoryEntry,
} from "./history";

async function clearDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STORAGE_KEYS.historyDatabase);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to clear test history."));
    request.onblocked = () => reject(new Error("Test history database deletion was blocked."));
  });
}

function createEntry(id: string, durationMs = 15_000): TestHistoryEntry {
  return {
    id,
    completedAt: "2026-10-11T12:00:00.000Z",
    durationMs,
    mode: "timed",
    modeValue: 30,
    metrics: {
      netWpm: 12,
      rawWpm: 15,
      accuracy: 80,
      consistency: 90,
      correctCharacters: 60,
      totalCharacters: 75,
      correctKeystrokes: 60,
      totalKeystrokes: 75,
    },
    keyErrors: { KeyA: 1 },
  };
}

describe("IndexedDB test history", () => {
  beforeEach(clearDatabase);

  it("creates the versioned schema and saves tests at the 15-second threshold", async () => {
    const database = await openTestHistoryDatabase();
    expect(database.version).toBe(HISTORY_SCHEMA_VERSION);
    expect(database.objectStoreNames.contains(HISTORY_STORE_NAME)).toBe(true);
    expect(database.transaction(HISTORY_STORE_NAME).objectStore(HISTORY_STORE_NAME).indexNames.contains("completedAt")).toBe(true);
    expect(database.objectStoreNames.contains(KEY_STATS_STORE_NAME)).toBe(true);
    expect(database.objectStoreNames.contains(LEARN_PROGRESS_STORE_NAME)).toBe(true);
    expect(database.objectStoreNames.contains(SETTINGS_STORE_NAME)).toBe(true);
    database.close();

    expect(await saveTestHistory(createEntry("short", 14_999))).toEqual({
      saved: false,
      reason: "under-minimum-duration",
    });
    expect(await readTestHistory()).toEqual([]);
    expect(await saveTestHistory(createEntry("threshold", 15_000))).toEqual({ saved: true });
    expect(await readTestHistory()).toHaveLength(1);
  });

  it("exports and merges valid records without duplicate IDs", async () => {
    await saveTestHistory(createEntry("first"));
    await saveTestHistory(createEntry("local-only"));
    const exported = await exportTestHistory();

    await clearDatabase();
    expect(await importTestHistory(exported)).toBe(2);
    expect(await importTestHistory(exported)).toBe(2);
    const history = await readTestHistory();
    expect(history).toHaveLength(2);
    expect(history).toContainEqual(expect.objectContaining({ id: "first", keyErrors: { KeyA: 1 } }));
    expect(history).toContainEqual(expect.objectContaining({ id: "local-only" }));

    const changed = createEntry("first");
    const exportedPayload = JSON.parse(exported) as Record<string, unknown>;
    const updatedBackup = JSON.stringify({
      ...exportedPayload,
      exportedAt: "2026-10-11T12:00:00.000Z",
      records: [{ ...changed, metrics: { ...changed.metrics, netWpm: 44 } }],
    });
    await importTestHistory(updatedBackup);
    expect((await readTestHistory()).find(({ id }) => id === "first")?.metrics.netWpm).toBe(44);
  });

  it("rejects malformed or unsupported imports before writing any records", async () => {
    expect(() => importTestHistory("{")).toThrow("not valid JSON");
    expect(() => importTestHistory(JSON.stringify({ format: "other", schemaVersion: 1, records: [] }))).toThrow(
      "not a supported",
    );
    expect(await readTestHistory()).toEqual([]);
  });

  it("rejects invalid records instead of persisting them", async () => {
    expect(() => saveTestHistory({
      ...createEntry("bad"),
      durationMs: 15_000,
      metrics: { ...createEntry("bad").metrics, accuracy: 101 },
    })).toThrow("invalid test result");
    expect(await readTestHistory()).toEqual([]);
  });

  it("migrates version 1 history without dropping its records", async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(STORAGE_KEYS.historyDatabase, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
        store.createIndex("completedAt", "completedAt");
        store.put(createEntry("legacy"));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();

    const upgraded = await openTestHistoryDatabase();
    expect(upgraded.version).toBe(2);
    upgraded.close();
    expect(await readTestHistory()).toEqual([createEntry("legacy")]);
  });

  it("persists per-key stats, Learn progress and settings, and includes them in backups", async () => {
    const state = {
      keyStats: {
        KeyF: { attempts: 8, errors: 1, smoothedTimeMs: 375, lastPracticedAt: 123 },
      },
      learnProgress: { completedStages: ["home-row"], currentStage: "top-row" },
      settings: { ageBand: "kids" as const, targetWpm: 18 },
    };
    await saveAdaptiveState(state);
    expect(await readAdaptiveState()).toEqual(state);

    const exported = JSON.parse(await exportTestHistory()) as {
      schemaVersion: number;
      adaptiveState: typeof state;
    };
    expect(exported.schemaVersion).toBe(2);
    expect(exported.adaptiveState).toEqual(state);

    await clearDatabase();
    await importTestHistory(JSON.stringify({
      ...exported,
      format: "Type now history",
      exportedAt: "2026-10-11T12:00:00.000Z",
    }));
    expect(await readAdaptiveState()).toEqual(state);
  });

  it("imports Phase 1 backups with default adaptive data", async () => {
    const phaseOneBackup = JSON.stringify({
      format: "Type now history",
      schemaVersion: 1,
      exportedAt: "2026-10-11T12:00:00.000Z",
      records: [createEntry("phase-one")],
    });
    await importTestHistory(phaseOneBackup);
    expect(await readTestHistory()).toEqual([createEntry("phase-one")]);
    expect(await readAdaptiveState()).toEqual({
      keyStats: {},
      learnProgress: { completedStages: [], currentStage: "home-row" },
      settings: { ageBand: "standard", targetWpm: 30 },
    });
  });

  it("keeps current adaptive settings when importing an older Phase 1 backup", async () => {
    const state = {
      keyStats: { KeyF: { attempts: 2, errors: 0, smoothedTimeMs: 300, lastPracticedAt: 50 } },
      learnProgress: { completedStages: ["home-row"], currentStage: "top-row" },
      settings: { ageBand: "kids" as const, targetWpm: 15 },
    };
    await saveAdaptiveState(state);
    await importTestHistory(JSON.stringify({
      format: "Type now history",
      schemaVersion: 1,
      exportedAt: "2026-10-11T12:00:00.000Z",
      records: [],
    }));
    expect(await readAdaptiveState()).toEqual(state);
  });
});
