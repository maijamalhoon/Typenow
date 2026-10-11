import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import blocklist from "./BLOCKLIST.json";
import { englishKeys, englishPack, filterBlockedWords, KIDS_MODE_ENABLED } from "./index";

const allowlistText = readFileSync(new URL("./kids-allowlist.txt", import.meta.url), "utf8");
const allowlistWords = allowlistText
  .split(/\r?\n/)
  .filter((line) => line.length > 0 && !line.startsWith("#"));
const problemWordGroups = new Map<string, string[]>();
let currentProblemGroup = "";
for (const line of readFileSync(new URL("./kids-list-problem-words.txt", import.meta.url), "utf8").split(/\r?\n/)) {
  const group = line.match(/^# (Tier [AB]):/);
  if (group) {
    currentProblemGroup = group[1];
    problemWordGroups.set(currentProblemGroup, []);
  } else if (line && !line.startsWith("#")) {
    problemWordGroups.get(currentProblemGroup)?.push(line);
  }
}

describe("English language pack", () => {
  it("maps every unlock code to a key definition", () => {
    expect(englishPack.unlockOrder.length).toBeGreaterThan(0);
    expect(englishPack.unlockOrder.every((code) => code in englishPack.keyMap)).toBe(true);
  });

  it("provides row, finger and position data for every key", () => {
    expect(englishKeys).toHaveLength(Object.keys(englishPack.keyMap).length);
    for (const key of englishKeys) {
      expect(key.code).toBeTruthy();
      expect(key.finger).toBeTruthy();
      expect(key.row).toBeTruthy();
      expect(Number.isInteger(key.column)).toBe(true);
    }
  });

  it("includes sourced, licensed words and pattern statistics", () => {
    expect(englishPack.words.length).toBeGreaterThan(10_000);
    expect(englishPack.words.every((word) => /^[a-z]{2,9}$/.test(word))).toBe(true);
    expect(englishPack.wordListSource.license).toContain("Public domain");
    expect(Object.keys(englishPack.letterPatterns.frequencies).length).toBeGreaterThan(0);
    expect(Object.keys(englishPack.letterPatterns.bigrams).length).toBeGreaterThan(0);
    expect(englishPack.wordListSource.selection).toContain("BLOCKLIST.json");
    expect(englishPack.kidsWordListSource.license).toContain("CC BY-SA 4.0");
  });

  it("filters the project blocklist and every Tier A term from Standard", () => {
    for (const word of blocklist) {
      expect(englishPack.words).not.toContain(word);
    }
    for (const word of problemWordGroups.get("Tier A") ?? []) expect(englishPack.words).not.toContain(word);
    expect(filterBlockedWords(["ordinary", "ass", "class"])).toEqual(["ordinary", "class"]);
  });

  it("uses only the staged plain-text allowlist and excludes every supplied problem word", () => {
    expect(allowlistWords).toHaveLength(englishPack.kidsWords.length);
    expect(new Set(allowlistWords).size).toBe(allowlistWords.length);
    expect(englishPack.kidsWords.every((word) => allowlistWords.includes(word))).toBe(true);
    expect(englishPack.kidsWords.length).toBeGreaterThanOrEqual(1_900);
    expect(englishPack.kidsWords.length).toBeLessThanOrEqual(2_100);
    expect(englishPack.kidsWords.every((word) => /^[a-z]{2,6}$/.test(word))).toBe(true);
    for (const words of problemWordGroups.values()) {
      for (const word of words) expect(englishPack.kidsWords).not.toContain(word);
    }
    expect(allowlistText).toContain("# Home row");
    expect(allowlistText).toContain("# Top row");
    expect(allowlistText).toContain("# Bottom row");
    expect(englishPack.kidsWordListSource.selection).toContain("kids-allowlist.txt");
  });

  it("keeps Kids mode disabled until the allowlist is explicitly approved", () => {
    expect(KIDS_MODE_ENABLED).toBe(false);
  });

  it("removes Kids Tier A words from Standard and excludes them from made-up word output", () => {
    expect((problemWordGroups.get("Tier A") ?? []).every((word) => !englishPack.words.includes(word))).toBe(true);
    expect(englishPack.excludedWords).toEqual(expect.arrayContaining(blocklist));
  });
});
