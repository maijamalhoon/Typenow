import { describe, expect, it } from "vitest";
import { calculateTestMetrics, countUserPerceivedCharacters } from "./metrics";

describe("test metrics", () => {
  it("calculates net/raw WPM and accuracy from typed characters and keystrokes", () => {
    const result = calculateTestMetrics({
      durationMs: 60_000,
      correctCharacters: 50,
      keyStrokes: Array.from({ length: 60 }, (_, index) => ({ correct: index < 57 })),
      rawWpmSamples: [60, 60, 60],
    });

    expect(result).toMatchObject({
      netWpm: 10,
      rawWpm: 12,
      accuracy: 95,
      consistency: 100,
      correctCharacters: 50,
      totalCharacters: 60,
      correctKeystrokes: 57,
      totalKeystrokes: 60,
    });
  });

  it("returns zeros for empty input and a zero-duration test", () => {
    expect(
      calculateTestMetrics({
        durationMs: 0,
        correctCharacters: 0,
        keyStrokes: [],
        rawWpmSamples: [],
      }),
    ).toEqual({
      netWpm: 0,
      rawWpm: 0,
      accuracy: 0,
      consistency: 0,
      correctCharacters: 0,
      totalCharacters: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 0,
    });
  });

  it("excludes Backspace and modifier presses from raw WPM and accuracy", () => {
    const result = calculateTestMetrics({
      durationMs: 60_000,
      correctCharacters: 4,
      keyStrokes: [
        { correct: true },
        { correct: false },
        { correct: true },
        { correct: true },
        { correct: true },
        { correct: false, kind: "backspace" },
        { correct: false, kind: "modifier" },
        { correct: false, kind: "modifier" },
        { correct: false, kind: "modifier" },
      ],
      rawWpmSamples: [1],
    });
    expect(result).toMatchObject({
      netWpm: 0.8,
      rawWpm: 1,
      accuracy: 80,
      totalCharacters: 5,
      totalKeystrokes: 5,
      correctKeystrokes: 4,
    });
  });

  it("reports zero consistency when no characters were typed", () => {
    const result = calculateTestMetrics({
      durationMs: 60_000,
      correctCharacters: 0,
      keyStrokes: [
        { correct: false, kind: "modifier" },
        { correct: false, kind: "backspace" },
      ],
      rawWpmSamples: [0, 0, 0],
    });
    expect(result).toMatchObject({ rawWpm: 0, accuracy: 0, consistency: 0 });
  });

  it("keeps only-error tests at zero net WPM and accuracy", () => {
    const result = calculateTestMetrics({
      durationMs: 30_000,
      correctCharacters: 0,
      keyStrokes: Array.from({ length: 25 }, () => ({ correct: false })),
      rawWpmSamples: [10, 10],
    });
    expect(result.netWpm).toBe(0);
    expect(result.rawWpm).toBe(10);
    expect(result.accuracy).toBe(0);
    expect(result.consistency).toBe(100);
  });

  it("uses actual duration for very short tests without imposing a speed floor", () => {
    const result = calculateTestMetrics({
      durationMs: 500,
      correctCharacters: 5,
      keyStrokes: Array.from({ length: 5 }, () => ({ correct: true })),
      rawWpmSamples: [120],
    });
    expect(result.netWpm).toBe(120);
    expect(result.rawWpm).toBe(120);
    expect(result.accuracy).toBe(100);
  });

  it("measures consistency as 100 times one minus population coefficient of variation", () => {
    const result = calculateTestMetrics({
      durationMs: 10_000,
      correctCharacters: 1,
      keyStrokes: [{ correct: true }],
      rawWpmSamples: [10, 20],
    });
    expect(result.consistency).toBeCloseTo(66.6667, 3);
  });

  it("counts grapheme clusters rather than UTF-16 code units", () => {
    expect(countUserPerceivedCharacters("a")).toBe(1);
    expect(countUserPerceivedCharacters("e\u0301")).toBe(1);
    expect(countUserPerceivedCharacters("👩‍💻")).toBe(1);
    expect(countUserPerceivedCharacters("a b")).toBe(3);
  });

  it("rejects invalid durations and impossible correct-character counts", () => {
    expect(() =>
      calculateTestMetrics({ durationMs: -1, correctCharacters: 0, keyStrokes: [], rawWpmSamples: [] }),
    ).toThrow(RangeError);
    expect(() =>
      calculateTestMetrics({ durationMs: 1, correctCharacters: 2, keyStrokes: [{ correct: true }], rawWpmSamples: [] }),
    ).toThrow(RangeError);
  });
});
