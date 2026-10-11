import { describe, expect, it } from "vitest";
import {
  applyBackspace,
  applyCharacter,
  countCorrectCharacters,
  createTestRun,
  generateWordPrompt,
} from "./test-run";

describe("test run editing", () => {
  it("generates a prompt from the supplied real-word corpus", () => {
    expect(generateWordPrompt(["apple", "river"], 4, () => 0.75)).toBe("river river river river");
  });

  it("rejects empty corpora and invalid word counts", () => {
    expect(() => generateWordPrompt([], 1)).toThrow(RangeError);
    expect(() => generateWordPrompt(["word"], 0)).toThrow(RangeError);
  });

  it("records each key attempt and preserves earlier typos after a correction", () => {
    let run = createTestRun("cat");
    run = applyCharacter(run, "x", "KeyX");
    run = applyBackspace(run);
    run = applyCharacter(run, "c", "KeyC");
    run = applyCharacter(run, "a", "KeyA");
    run = applyCharacter(run, "t", "KeyT");

    expect(run.typed.map(({ character, correct }) => [character, correct])).toEqual([
      ["c", true],
      ["a", true],
      ["t", true],
    ]);
    expect(run.keyStrokes.map(({ correct }) => correct)).toEqual([false, true, true, true]);
    expect(countCorrectCharacters(run)).toBe(3);
  });

  it("does not let backspace cross a word boundary", () => {
    let run = createTestRun("go now");
    for (const character of "go ") run = applyCharacter(run, character, "KeyG");
    const before = run;
    expect(applyBackspace(run)).toBe(before);

    run = applyCharacter(run, "n", "KeyN");
    expect(applyBackspace(run).cursor).toBe(3);
    expect(applyBackspace(applyBackspace(run)).cursor).toBe(3);
  });

  it("compares grapheme clusters rather than UTF-16 code units", () => {
    let run = createTestRun("e\u0301🙂");
    run = applyCharacter(run, "é", "KeyE");
    run = applyCharacter(run, "🙂", "Unidentified");
    expect(run.cursor).toBe(2);
    expect(run.keyStrokes.every(({ correct }) => correct)).toBe(true);
  });
});
