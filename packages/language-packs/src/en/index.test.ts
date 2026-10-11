import { describe, expect, it } from "vitest";
import blocklist from "./BLOCKLIST.json";
import { englishKeys, englishPack, filterBlockedWords } from "./index";

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
    expect(englishPack.kidsWordListSource.license).toContain("Public domain");
  });

  it("filters every blocked entry from Standard and Kids word lists", () => {
    for (const word of blocklist) {
      expect(englishPack.words).not.toContain(word);
      expect(englishPack.kidsWords).not.toContain(word);
    }
    expect(filterBlockedWords(["ordinary", "ass", "class"])).toEqual(["ordinary", "class"]);
  });

  it("provides a smaller Kids vocabulary from the shared short core-word set", () => {
    expect(englishPack.kidsWords.length).toBeGreaterThan(1_000);
    expect(englishPack.kidsWords.length).toBeLessThan(englishPack.words.length);
    expect(englishPack.kidsWords.every((word) => /^[a-z]{2,6}$/.test(word))).toBe(true);
    expect(englishPack.kidsWords.every((word) => englishPack.words.includes(word))).toBe(true);
    expect(englishPack.kidsWordListSource.selection).toContain("2of4brif");
  });
});
