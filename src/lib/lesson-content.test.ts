import { describe, expect, it } from "vitest";
import { englishPack } from "@typenow/language-packs";
import { createWordPracticeTarget } from "./lesson-content";

const homeRowKeys = englishPack.unlockOrder.slice(0, 9);

describe("Learn word practice content", () => {
  it("draws at least 20 randomized, stage-typeable common words reproducibly by seed", () => {
    const first = createWordPracticeTarget(englishPack, homeRowKeys, "standard", 30, "first");
    const repeated = createWordPracticeTarget(englishPack, homeRowKeys, "standard", 30, "first");
    const nextRun = createWordPracticeTarget(englishPack, homeRowKeys, "standard", 30, "second");
    const homeLetters = new Set<string>(homeRowKeys.map((code) => englishPack.keyMap[code].unshifted));
    expect(first.split(" ")).toHaveLength(30);
    expect(first).toBe(repeated);
    expect(first).not.toBe(nextRun);
    expect(first.split(" ").every((word) => [...word].every((letter) => homeLetters.has(letter)))).toBe(true);
  });

  it("uses only Kids allowlist entries when building a Kids Learn prompt", () => {
    const prompt = createWordPracticeTarget(englishPack, homeRowKeys, "kids", 40, "kids-run");
    const allowlist = new Set<string>(englishPack.kidsWords);
    expect(prompt.split(" ").every((word) => allowlist.has(word))).toBe(true);
  });

  it("rejects missing keys, invalid word counts, and stages with no available words", () => {
    expect(() => createWordPracticeTarget(englishPack, [], "standard", 20, "empty")).toThrow("at least one key");
    expect(() => createWordPracticeTarget(englishPack, homeRowKeys, "standard", 0, "empty")).toThrow("positive integer");
    expect(() =>
      createWordPracticeTarget(englishPack, ["NotAKey"], "kids", 20, "empty"),
    ).toThrow("unlock order");
    const emptyPack = { ...englishPack, kidsWords: [], commonWords: [] };
    expect(() => createWordPracticeTarget(emptyPack, homeRowKeys, "kids", 20, "empty")).toThrow("No approved words");
  });
});
