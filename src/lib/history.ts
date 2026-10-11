import type { TestMetrics } from "@typenow/engine";
import { PRODUCT_NAME, STORAGE_KEYS } from "./brand";

export const HISTORY_SCHEMA_VERSION = 2;
export const MINIMUM_SAVED_TEST_DURATION_MS = 15_000;
export const HISTORY_STORE_NAME = "test-results";
export const KEY_STATS_STORE_NAME = "key-stats";
export const LEARN_PROGRESS_STORE_NAME = "learn-progress";
export const SETTINGS_STORE_NAME = "app-settings";
const STATE_RECORD_ID = "current";

export type HistoryTestMode = "timed" | "words";

export interface TestHistoryEntry {
  readonly id: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly mode: HistoryTestMode;
  readonly modeValue: number;
  readonly metrics: TestMetrics;
  readonly keyErrors: Readonly<Record<string, number>>;
}

export interface LearnProgress {
  readonly completedStages: readonly string[];
  readonly currentStage: string;
}

export interface PersistedTypingSettings {
  readonly ageBand: "standard" | "kids";
  readonly targetWpm: number;
}

export interface AdaptiveState {
  readonly keyStats: Readonly<Record<string, import("@typenow/engine").KeyPracticeStats>>;
  readonly learnProgress: LearnProgress;
  readonly settings: PersistedTypingSettings;
}

export interface TestHistoryExport {
  readonly format: string;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly records: readonly TestHistoryEntry[];
  readonly adaptiveState: AdaptiveState;
}

export type SaveHistoryResult =
  | { readonly saved: true }
  | { readonly saved: false; readonly reason: "under-minimum-duration" };

const exportFormat = `${PRODUCT_NAME} history`;

export function openTestHistoryDatabase(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));

  return new Promise((resolve, reject) => {
    const request = factory.open(STORAGE_KEYS.historyDatabase, HISTORY_SCHEMA_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(HISTORY_STORE_NAME)
        ? request.transaction?.objectStore(HISTORY_STORE_NAME)
        : database.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      if (!store) throw new Error("Unable to create the local history object store.");
      if (!store.indexNames.contains("completedAt")) {
        store.createIndex("completedAt", "completedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(KEY_STATS_STORE_NAME)) {
        database.createObjectStore(KEY_STATS_STORE_NAME, { keyPath: "keyCode" });
      }
      if (!database.objectStoreNames.contains(LEARN_PROGRESS_STORE_NAME)) {
        database.createObjectStore(LEARN_PROGRESS_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        database.createObjectStore(SETTINGS_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Local history is blocked by another open tab. Close it and try again."));
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Unable to open local history."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export function saveTestHistory(entry: TestHistoryEntry): Promise<SaveHistoryResult> {
  assertHistoryEntry(entry);
  if (entry.durationMs < MINIMUM_SAVED_TEST_DURATION_MS) {
    return Promise.resolve({ saved: false, reason: "under-minimum-duration" });
  }
  return withStoreTransaction("readwrite", (store, setResult) => {
    const request = store.put(entry);
    request.onsuccess = () => setResult({ saved: true });
  });
}

export function readTestHistory(): Promise<TestHistoryEntry[]> {
  return withStoreTransaction("readonly", (store, setResult) => {
    const request = store.getAll() as IDBRequest<TestHistoryEntry[]>;
    request.onsuccess = () => {
      setResult(request.result.sort((left, right) => right.completedAt.localeCompare(left.completedAt)));
    };
  });
}

export async function exportTestHistory(): Promise<string> {
  const payload: TestHistoryExport = {
    format: exportFormat,
    schemaVersion: HISTORY_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    records: await readTestHistory(),
    adaptiveState: await readAdaptiveState(),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseTestHistoryExport(json: string): TestHistoryExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("The selected backup is not valid JSON.", { cause: error });
  }
  if (
    !isRecord(parsed) ||
    parsed.format !== exportFormat ||
    (parsed.schemaVersion !== 1 && parsed.schemaVersion !== HISTORY_SCHEMA_VERSION) ||
    typeof parsed.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.exportedAt)) ||
    !Array.isArray(parsed.records) ||
    !parsed.records.every(isPersistedHistoryEntry)
  ) {
    throw new TypeError("The selected file is not a supported Type now history backup.");
  }
  const adaptiveState =
    parsed.schemaVersion === 1 ? DEFAULT_ADAPTIVE_STATE : parsed.adaptiveState;
  if (!isAdaptiveState(adaptiveState)) {
    throw new TypeError("The selected file is not a supported Type now history backup.");
  }
  return {
    format: parsed.format,
    schemaVersion: parsed.schemaVersion,
    exportedAt: parsed.exportedAt,
    records: parsed.records,
    adaptiveState,
  };
}

export function importTestHistory(json: string): Promise<number> {
  const payload = parseTestHistoryExport(json);
  if (payload.schemaVersion === 1) {
    return withStoreTransaction("readwrite", (store, setResult) => {
      for (const record of payload.records) store.put(record);
      setResult(payload.records.length);
    });
  }
  return withDatabaseTransaction(
    [HISTORY_STORE_NAME, KEY_STATS_STORE_NAME, LEARN_PROGRESS_STORE_NAME, SETTINGS_STORE_NAME],
    "readwrite",
    (stores, setResult) => {
      for (const record of payload.records) stores[HISTORY_STORE_NAME].put(record);
      stores[KEY_STATS_STORE_NAME].clear();
      for (const [keyCode, stats] of Object.entries(payload.adaptiveState.keyStats)) {
        stores[KEY_STATS_STORE_NAME].put({ keyCode, ...stats });
      }
      stores[LEARN_PROGRESS_STORE_NAME].put({
        id: STATE_RECORD_ID,
        ...payload.adaptiveState.learnProgress,
      });
      stores[SETTINGS_STORE_NAME].put({
        id: STATE_RECORD_ID,
        ...payload.adaptiveState.settings,
      });
      setResult(payload.records.length);
    },
  ).then(() => payload.records.length);
}

export const DEFAULT_ADAPTIVE_STATE: AdaptiveState = {
  keyStats: {},
  learnProgress: { completedStages: [], currentStage: "home-row" },
  settings: { ageBand: "standard", targetWpm: 30 },
};

export function readAdaptiveState(): Promise<AdaptiveState> {
  return withDatabaseTransaction(
    [KEY_STATS_STORE_NAME, LEARN_PROGRESS_STORE_NAME, SETTINGS_STORE_NAME],
    "readonly",
    (stores, setResult) => {
      const statsRequest = stores[KEY_STATS_STORE_NAME].getAll();
      const progressRequest = stores[LEARN_PROGRESS_STORE_NAME].get(STATE_RECORD_ID);
      const settingsRequest = stores[SETTINGS_STORE_NAME].get(STATE_RECORD_ID);
      let completed = 0;
      const finish = () => {
        completed += 1;
        if (completed !== 3) return;
        const keyStats = Object.fromEntries(
          (statsRequest.result as Array<{ keyCode: string } & import("@typenow/engine").KeyPracticeStats>)
            .map(({ keyCode, ...stats }) => [keyCode, stats]),
        );
        const progress = progressRequest.result as (LearnProgress & { id: string }) | undefined;
        const settings = settingsRequest.result as (PersistedTypingSettings & { id: string }) | undefined;
        setResult({
          keyStats,
          learnProgress: progress
            ? { completedStages: progress.completedStages, currentStage: progress.currentStage }
            : DEFAULT_ADAPTIVE_STATE.learnProgress,
          settings: settings
            ? { ageBand: settings.ageBand, targetWpm: settings.targetWpm }
            : DEFAULT_ADAPTIVE_STATE.settings,
        });
      };
      statsRequest.onsuccess = finish;
      progressRequest.onsuccess = finish;
      settingsRequest.onsuccess = finish;
    },
  );
}

export function saveAdaptiveState(state: AdaptiveState): Promise<void> {
  if (!isAdaptiveState(state)) throw new TypeError("Cannot save invalid adaptive typing data.");
  return withDatabaseTransaction(
    [KEY_STATS_STORE_NAME, LEARN_PROGRESS_STORE_NAME, SETTINGS_STORE_NAME],
    "readwrite",
    (stores, setResult) => {
      stores[KEY_STATS_STORE_NAME].clear();
      for (const [keyCode, stats] of Object.entries(state.keyStats)) {
        stores[KEY_STATS_STORE_NAME].put({ keyCode, ...stats });
      }
      stores[LEARN_PROGRESS_STORE_NAME].put({ id: STATE_RECORD_ID, ...state.learnProgress });
      stores[SETTINGS_STORE_NAME].put({ id: STATE_RECORD_ID, ...state.settings });
      setResult(undefined);
    },
  );
}

function withStoreTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void) => void,
): Promise<T> {
  return withDatabaseTransaction([HISTORY_STORE_NAME], mode, (stores, setResult) => {
    operation(stores[HISTORY_STORE_NAME], setResult);
  });
}

function withDatabaseTransaction<T>(
  storeNames: readonly string[],
  mode: IDBTransactionMode,
  operation: (
    stores: Readonly<Record<string, IDBObjectStore>>,
    setResult: (value: T) => void,
  ) => void,
): Promise<T> {
  return openTestHistoryDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction([...storeNames], mode);
        } catch (error) {
          database.close();
          reject(error);
          return;
        }

        let result: T;
        let hasResult = false;
        let failure: unknown;
        transaction.oncomplete = () => {
          database.close();
          if (failure !== undefined) {
            reject(failure);
          } else if (hasResult) {
            resolve(result);
          } else {
            reject(new Error("Local history transaction completed without a result."));
          }
        };
        transaction.onerror = () => {
          failure = transaction.error ?? new Error("Local history transaction failed.");
        };
        transaction.onabort = () => {
          database.close();
          reject(failure ?? transaction.error ?? new Error("Local history transaction was aborted."));
        };

        try {
          operation(
            Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)])),
            (value) => {
            result = value;
            hasResult = true;
            },
          );
        } catch (error) {
          failure = error;
          try {
            transaction.abort();
          } catch {
            database.close();
            reject(error);
          }
        }
      }),
  );
}

function assertHistoryEntry(value: unknown): asserts value is TestHistoryEntry {
  if (!isHistoryEntry(value)) throw new TypeError("Cannot save an invalid test result.");
}

function isHistoryEntry(value: unknown): value is TestHistoryEntry {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return false;
  if (
    typeof value.completedAt !== "string" ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !isNonNegativeFinite(value.durationMs) ||
    (value.mode !== "timed" && value.mode !== "words") ||
    typeof value.modeValue !== "number" ||
    !Number.isInteger(value.modeValue) ||
    value.modeValue <= 0 ||
    !isRecord(value.metrics) ||
    !isRecord(value.keyErrors)
  ) {
    return false;
  }

  const metrics = value.metrics;
  return (
    isNonNegativeFinite(metrics.netWpm) &&
    isNonNegativeFinite(metrics.rawWpm) &&
    isPercentage(metrics.accuracy) &&
    isPercentage(metrics.consistency) &&
    isNonNegativeInteger(metrics.correctCharacters) &&
    isNonNegativeInteger(metrics.totalCharacters) &&
    isNonNegativeInteger(metrics.correctKeystrokes) &&
    isNonNegativeInteger(metrics.totalKeystrokes) &&
    metrics.correctCharacters <= metrics.totalCharacters &&
    metrics.correctKeystrokes <= metrics.totalKeystrokes &&
    Object.values(value.keyErrors).every(isNonNegativeInteger)
  );
}

function isPersistedHistoryEntry(value: unknown): value is TestHistoryEntry {
  return isHistoryEntry(value) && value.durationMs >= MINIMUM_SAVED_TEST_DURATION_MS;
}

function isAdaptiveState(value: unknown): value is AdaptiveState {
  if (!isRecord(value) || !isRecord(value.keyStats) || !isRecord(value.learnProgress) || !isRecord(value.settings)) {
    return false;
  }
  const progress = value.learnProgress;
  const settings = value.settings;
  return (
    Array.isArray(progress.completedStages) &&
    progress.completedStages.every((stage) => typeof stage === "string") &&
    typeof progress.currentStage === "string" &&
    (settings.ageBand === "standard" || settings.ageBand === "kids") &&
    isNonNegativeFinite(settings.targetWpm) &&
    settings.targetWpm > 0 &&
    Object.values(value.keyStats).every(isKeyPracticeStats)
  );
}

function isKeyPracticeStats(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.attempts) &&
    isNonNegativeInteger(value.errors) &&
    value.errors <= value.attempts &&
    (value.smoothedTimeMs === null || isNonNegativeFinite(value.smoothedTimeMs)) &&
    isNonNegativeFinite(value.lastPracticedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPercentage(value: unknown): value is number {
  return isNonNegativeFinite(value) && value <= 100;
}
