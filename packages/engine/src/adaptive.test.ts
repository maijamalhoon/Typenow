import { describe, expect, it } from "vitest";
import { englishPack } from "@typenow/language-packs";
import {
  ADAPTIVE_DEFAULTS,
  createLessonRun,
  createSeededRandom,
  generatePracticePrompt,
  getDefaultTargetWpm,
  getKeyErrorRate,
  getKeyProgressStatus,
  getKeyTimeBudgetMs,
  getPracticeTimeSample,
  getLessonCheckpoint,
  getStaleReviewKeys,
  getUnlockedKeys,
  isKeyConfident,
  recordKeyAttempt,
  selectWeakestKey,
  startAnotherLessonRound,
  submitLessonCharacter,
  type PerKeyStats,
} from "./adaptive";

function buildConfidentStats(keys: readonly string[], timeMs = 350): PerKeyStats {
  let stats: PerKeyStats = {};
  for (const keyCode of keys) {
    for (let sample = 0; sample < ADAPTIVE_DEFAULTS.minimumSamples; sample += 1) {
      stats = recordKeyAttempt(stats, keyCode, timeMs, true, sample + 1);
    }
  }
  return stats;
}

describe("adaptive typing engine", () => {
  it("converts target WPM into a per-key time budget and supplies age-band targets", () => {
    expect(getKeyTimeBudgetMs(30)).toBe(400);
    expect(getKeyTimeBudgetMs(15)).toBe(800);
    expect(getDefaultTargetWpm("standard")).toBe(30);
    expect(getDefaultTargetWpm("kids")).toBe(15);
  });

  it("starts time samples at a previous correct key, resets after pauses, and drops long gaps", () => {
    expect(getPracticeTimeSample(null, 100, true)).toBeNull();
    expect(getPracticeTimeSample(100, 350, true)).toBe(250);
    expect(getPracticeTimeSample(100, 350, false)).toBeNull();
    expect(getPracticeTimeSample(100, 3_101, true)).toBeNull();
    expect(ADAPTIVE_DEFAULTS.maximumSampleGapMs).toBe(3_000);
  });

  it("smooths per-key time samples and tracks errors and last practice time", () => {
    let stats: PerKeyStats = {};
    stats = recordKeyAttempt(stats, "KeyF", 500, true, 1_000);
    stats = recordKeyAttempt(stats, "KeyF", 300, false, 2_000);
    expect(stats.KeyF).toEqual({
      attempts: 2,
      errors: 1,
      smoothedTimeMs: 450,
      lastPracticedAt: 2_000,
    });
    expect(getKeyErrorRate(stats.KeyF)).toBe(0.5);
  });

  it("records misses against the intended key without inventing a time sample", () => {
    const withMiss = recordKeyAttempt({}, "KeyF", null, false, 1_000);
    expect(withMiss.KeyF).toEqual({
      attempts: 1,
      errors: 1,
      smoothedTimeMs: null,
      lastPracticedAt: 1_000,
    });
    expect(recordKeyAttempt(withMiss, "KeyF", 350, true, 1_500).KeyF).toMatchObject({
      attempts: 2,
      errors: 1,
      smoothedTimeMs: 350,
    });
  });

  it("requires the minimum sample count, target-time budget, and low error rate for confidence", () => {
    const confident = buildConfidentStats(["KeyF"]);
    expect(isKeyConfident(confident.KeyF, 30)).toBe(true);
    expect(isKeyConfident(confident.KeyF, 15)).toBe(true);

    let tooFew = buildConfidentStats(["KeyJ"]);
    tooFew = { ...tooFew, KeyJ: { ...tooFew.KeyJ, attempts: ADAPTIVE_DEFAULTS.minimumSamples - 1 } };
    expect(isKeyConfident(tooFew.KeyJ, 30)).toBe(false);

    let tooSlow: PerKeyStats = {};
    for (let sample = 0; sample < ADAPTIVE_DEFAULTS.minimumSamples; sample += 1) {
      tooSlow = recordKeyAttempt(tooSlow, "KeyD", 401, true, sample);
    }
    expect(isKeyConfident(tooSlow.KeyD, 30)).toBe(false);

    let tooManyErrors: PerKeyStats = {};
    for (let sample = 0; sample < ADAPTIVE_DEFAULTS.minimumSamples; sample += 1) {
      tooManyErrors = recordKeyAttempt(tooManyErrors, "KeyK", 300, sample > 0, sample);
    }
    expect(isKeyConfident(tooManyErrors.KeyK, 30)).toBe(false);
  });

  it("classifies per-key status as new, learning, confident, or due for review", () => {
    const confident = buildConfidentStats(["KeyF"], 350).KeyF;
    expect(getKeyProgressStatus(undefined, 30, 100_000)).toBe("new");
    expect(getKeyProgressStatus({ ...confident, attempts: 0 }, 30, 100_000)).toBe("new");
    expect(getKeyProgressStatus({ ...confident, attempts: 2 }, 30, 100_000)).toBe("learning");
    expect(getKeyProgressStatus(confident, 30, 100_000)).toBe("confident");
    expect(getKeyProgressStatus(confident, 30, 100_000 + ADAPTIVE_DEFAULTS.staleKeyAfterMs)).toBe("needs review");
  });

  it("unlocks keys strictly in language-pack order only after all unlocked keys are confident", () => {
    let stats = buildConfidentStats(englishPack.unlockOrder.slice(0, 9));
    expect(getUnlockedKeys(englishPack, {}, 30)).toEqual(englishPack.unlockOrder.slice(0, 9));
    expect(getUnlockedKeys(englishPack, stats, 30)).toEqual(englishPack.unlockOrder.slice(0, 10));

    stats = buildConfidentStats(englishPack.unlockOrder.slice(0, 10));
    expect(getUnlockedKeys(englishPack, stats, 30)).toEqual(englishPack.unlockOrder.slice(0, 11));
    expect(englishPack.keyMap[englishPack.unlockOrder[0]].row).toBe("home");
    expect(englishPack.keyMap[englishPack.unlockOrder[9]].row).toBe("top");
  });

  it("selects the slowest or least accurate unlocked key for focused review", () => {
    const stats = {
      KeyF: { attempts: 8, errors: 0, smoothedTimeMs: 350, lastPracticedAt: 1 },
      KeyJ: { attempts: 8, errors: 2, smoothedTimeMs: 300, lastPracticedAt: 1 },
      KeyD: { attempts: 8, errors: 0, smoothedTimeMs: 3_000, lastPracticedAt: 1 },
    };
    expect(selectWeakestKey(["KeyF", "KeyJ", "KeyD"], stats, 30)).toBe("KeyD");
  });

  it("ignores Space when selecting the weakest key", () => {
    const stats = {
      Space: { attempts: 8, errors: 0, smoothedTimeMs: 10_000, lastPracticedAt: 1 },
      KeyF: { attempts: 8, errors: 0, smoothedTimeMs: 350, lastPracticedAt: 1 },
    };
    expect(selectWeakestKey(["Space", "KeyF"], stats, 30)).toBe("KeyF");
    expect(() => selectWeakestKey(["Space"], stats, 30)).toThrow("unlocked letter key");
  });

  it("creates repeatable seeded prompts and forces the weakest key into most Standard words", () => {
    const unlocked = englishPack.unlockOrder.slice(0, 9);
    const firstPrompt = generatePracticePrompt(englishPack, unlocked, "standard", createSeededRandom("session-1"), {
      weakestKeyCode: "KeyD",
      wordCount: 100,
    });
    const repeatedPrompt = generatePracticePrompt(englishPack, unlocked, "standard", createSeededRandom("session-1"), {
      weakestKeyCode: "KeyD",
      wordCount: 100,
    });
    expect(firstPrompt).toBe(repeatedPrompt);

    const words = firstPrompt.split(" ");
    expect(words).toHaveLength(100);
    expect(words.filter((word) => word.includes("d")).length / words.length).toBeGreaterThan(0.5);
    const unlockedLetters = new Set<string>(unlocked.map((code) => englishPack.keyMap[code].unshifted));
    expect(words.every((word) => [...word].every((letter) => unlockedLetters.has(letter)))).toBe(true);
    expect(words.every((word) => word.length >= 3 && word.length <= 6)).toBe(true);
  });

  it("never returns a made-up word from the language pack exclusion list", () => {
    const excluded = new Set<string>(englishPack.excludedWords);
    const prompt = generatePracticePrompt(
      englishPack,
      englishPack.unlockOrder.slice(0, 9),
      "standard",
      createSeededRandom("excluded-word-regression"),
      { weakestKeyCode: "KeyD", wordCount: 1_000 },
    );
    expect(prompt.split(" ").some((word) => excluded.has(word))).toBe(false);
  });

  it("uses only unlocked real words in Kids practice", () => {
    const unlocked = englishPack.unlockOrder.slice(0, 9);
    const prompt = generatePracticePrompt(englishPack, unlocked, "kids", createSeededRandom(7), {
      wordCount: 40,
    });
    const words = prompt.split(" ");
    const unlockedLetters = new Set<string>(unlocked.map((code) => englishPack.keyMap[code].unshifted));
    expect(words).toHaveLength(40);
    const allowlist = new Set<string>(englishPack.kidsWords);
    expect(words.every((word) => allowlist.has(word))).toBe(true);
    expect(words.every((word) => [...word].every((letter) => unlockedLetters.has(letter)))).toBe(true);
  });

  it("prioritizes practiced keys that have gone stale", () => {
    const stats: PerKeyStats = {
      KeyF: { attempts: 8, errors: 0, smoothedTimeMs: 350, lastPracticedAt: 1_000 },
      KeyJ: { attempts: 8, errors: 0, smoothedTimeMs: 350, lastPracticedAt: 6_000 },
      KeyD: { attempts: 8, errors: 0, smoothedTimeMs: 350, lastPracticedAt: 8_000 },
    };
    expect(getStaleReviewKeys(stats, 10_000, 4_000)).toEqual(["KeyF", "KeyJ"]);
    expect(getStaleReviewKeys(stats, 10_000)).toEqual([]);
  });

  it("blocks on a wrong lesson key, checks age-band thresholds, and allows another round", () => {
    let standard = createLessonRun("asdfghjkl;'", "standard");
    standard = submitLessonCharacter(standard, "x");
    expect(standard.cursor).toBe(0);
    expect(standard.lastAttemptCorrect).toBe(false);
    for (const character of "asdfghjkl;'") standard = submitLessonCharacter(standard, character);
    expect(getLessonCheckpoint(standard)).toMatchObject({
      complete: true,
      passed: false,
      accuracy: expect.closeTo(91.6667, 3),
      threshold: 95,
    });

    let kids = createLessonRun("asdfghjkl;'", "kids");
    kids = submitLessonCharacter(kids, "x");
    for (const character of "asdfghjkl;'") kids = submitLessonCharacter(kids, character);
    expect(getLessonCheckpoint(kids)).toMatchObject({
      complete: true,
      passed: true,
      accuracy: expect.closeTo(91.6667, 3),
      threshold: 90,
    });
    const retry = startAnotherLessonRound(kids);
    expect(retry).toMatchObject({ cursor: 0, attempts: 0, ageBand: "kids" });
    for (const character of "asdfghjkl;'") kids = submitLessonCharacter(kids, character);
    expect(getLessonCheckpoint(kids).passed).toBe(true);
  });

  it("validates bad times, target speeds, seeds, and missing Kids words", () => {
    expect(() => getKeyTimeBudgetMs(0)).toThrow(RangeError);
    expect(() => recordKeyAttempt({}, "KeyF", -1, true, 0)).toThrow(RangeError);
    expect(() => createSeededRandom(Number.NaN)).toThrow(RangeError);
    expect(() =>
      generatePracticePrompt(englishPack, ["KeyQ"], "kids", createSeededRandom(1)),
    ).toThrow("No Kids vocabulary words");
  });
});
