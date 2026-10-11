import { splitUserPerceivedCharacters } from "./metrics";

export const ADAPTIVE_DEFAULTS = {
  /** Standard adaptive target; the per-key budget is 60,000 / (WPM * 5). */
  standardTargetWpm: 30,
  /** Kids mode starts at 15 WPM unless a saved user setting overrides it. */
  kidsTargetWpm: 15,
  /** Confidence requires this many attempts for a key before it can unlock another key. */
  minimumSamples: 8,
  /** Exponential smoothing weight applied to each new per-key typing-time sample. */
  timeSmoothingAlpha: 0.25,
  /** Maximum aggregate error fraction accepted for a key to count as confident. */
  maximumErrorRate: 0.05,
  /** The complete first row is the usable baseline; later rows unlock sequentially. */
  initiallyUnlockedKeyCount: 9,
  /** Fraction of Standard practice words in which the current weakest key is forced. */
  weakestKeyWordProbability: 0.7,
  /** Shortest generated Standard pseudo-word, in user-perceived letters. */
  minimumGeneratedWordLength: 3,
  /** Longest generated Standard pseudo-word, in user-perceived letters. */
  maximumGeneratedWordLength: 6,
  /** Number of words in a generated practice prompt unless the caller selects another count. */
  defaultPromptWordCount: 20,
  /** A practiced key becomes due for spaced review after this interval. */
  staleKeyAfterMs: 7 * 24 * 60 * 60 * 1_000,
  /** Maximum number of stale keys selected for one review batch. */
  maximumStaleKeysPerReview: 2,
  /** Standard lesson checkpoints require this percentage of keystrokes to be correct. */
  standardCheckpointAccuracy: 95,
  /** Kids lesson checkpoints require this percentage of keystrokes to be correct. */
  kidsCheckpointAccuracy: 90,
} as const;

export type AdaptiveAgeBand = "standard" | "kids";
export type Seed = number | string;
export type RandomSource = () => number;

export interface AdaptiveKeyDefinition {
  readonly unshifted: string;
}

export interface AdaptiveLanguagePack {
  readonly keyMap: Readonly<Record<string, AdaptiveKeyDefinition>>;
  readonly unlockOrder: readonly string[];
  readonly words: readonly string[];
  readonly kidsWords: readonly string[];
  readonly letterPatterns: {
    readonly frequencies: Readonly<Record<string, number>>;
    readonly bigrams: Readonly<Record<string, number>>;
  };
}

export interface KeyPracticeStats {
  readonly attempts: number;
  readonly errors: number;
  readonly smoothedTimeMs: number | null;
  readonly lastPracticedAt: number;
}

export type PerKeyStats = Readonly<Record<string, KeyPracticeStats>>;

export function getDefaultTargetWpm(ageBand: AdaptiveAgeBand): number {
  return ageBand === "kids"
    ? ADAPTIVE_DEFAULTS.kidsTargetWpm
    : ADAPTIVE_DEFAULTS.standardTargetWpm;
}

export function getKeyTimeBudgetMs(
  targetWpm: number = ADAPTIVE_DEFAULTS.standardTargetWpm,
): number {
  assertPositiveFinite(targetWpm, "Target WPM");
  return 60_000 / (targetWpm * 5);
}

export function recordKeyAttempt(
  stats: PerKeyStats,
  keyCode: string,
  elapsedMs: number,
  correct: boolean,
  timestampMs: number,
  smoothingAlpha = ADAPTIVE_DEFAULTS.timeSmoothingAlpha,
): PerKeyStats {
  if (!keyCode) throw new TypeError("A key code is required to record practice.");
  assertNonNegativeFinite(elapsedMs, "Key time");
  assertNonNegativeFinite(timestampMs, "Practice timestamp");
  if (typeof correct !== "boolean") throw new TypeError("Key correctness must be a boolean.");
  if (!Number.isFinite(smoothingAlpha) || smoothingAlpha <= 0 || smoothingAlpha > 1) {
    throw new RangeError("Smoothing alpha must be greater than 0 and no greater than 1.");
  }

  const previous = stats[keyCode];
  const smoothedTimeMs =
    previous?.smoothedTimeMs === null || previous?.smoothedTimeMs === undefined
      ? elapsedMs
      : previous.smoothedTimeMs * (1 - smoothingAlpha) + elapsedMs * smoothingAlpha;

  return {
    ...stats,
    [keyCode]: {
      attempts: (previous?.attempts ?? 0) + 1,
      errors: (previous?.errors ?? 0) + (correct ? 0 : 1),
      smoothedTimeMs,
      lastPracticedAt: timestampMs,
    },
  };
}

export function getKeyErrorRate(stats: KeyPracticeStats | undefined): number {
  return !stats || stats.attempts === 0 ? 0 : stats.errors / stats.attempts;
}

export function isKeyConfident(
  stats: KeyPracticeStats | undefined,
  targetWpm: number = ADAPTIVE_DEFAULTS.standardTargetWpm,
  minimumSamples: number = ADAPTIVE_DEFAULTS.minimumSamples,
  maximumErrorRate: number = ADAPTIVE_DEFAULTS.maximumErrorRate,
): boolean {
  assertPositiveFinite(targetWpm, "Target WPM");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1) {
    throw new RangeError("Minimum sample count must be a positive integer.");
  }
  if (!Number.isFinite(maximumErrorRate) || maximumErrorRate < 0 || maximumErrorRate > 1) {
    throw new RangeError("Maximum error rate must be between 0 and 1.");
  }

  return Boolean(
    stats &&
      stats.attempts >= minimumSamples &&
      stats.smoothedTimeMs !== null &&
      stats.smoothedTimeMs <= getKeyTimeBudgetMs(targetWpm) &&
      getKeyErrorRate(stats) <= maximumErrorRate,
  );
}

export function getUnlockedKeys(
  pack: AdaptiveLanguagePack,
  stats: PerKeyStats,
  targetWpm: number = ADAPTIVE_DEFAULTS.standardTargetWpm,
): string[] {
  const orderedKeys = pack.unlockOrder;
  const unlocked = orderedKeys.slice(
    0,
    Math.min(ADAPTIVE_DEFAULTS.initiallyUnlockedKeyCount, orderedKeys.length),
  );
  while (
    unlocked.length < orderedKeys.length &&
    unlocked.every((keyCode) => isKeyConfident(stats[keyCode], targetWpm))
  ) {
    unlocked.push(orderedKeys[unlocked.length]);
  }
  return unlocked;
}

export function selectWeakestKey(
  unlockedKeys: readonly string[],
  stats: PerKeyStats,
  targetWpm: number = ADAPTIVE_DEFAULTS.standardTargetWpm,
): string {
  if (unlockedKeys.length === 0) throw new RangeError("At least one key must be unlocked.");
  const timeBudget = getKeyTimeBudgetMs(targetWpm);
  return unlockedKeys.reduce((weakest, candidate) => {
    const candidateStats = stats[candidate];
    const weakestStats = stats[weakest];
    const candidateScore = weaknessScore(candidateStats, timeBudget);
    const weakestScore = weaknessScore(weakestStats, timeBudget);
    return candidateScore > weakestScore ? candidate : weakest;
  });
}

export function getStaleReviewKeys(
  stats: PerKeyStats,
  nowMs: number,
  staleAfterMs = ADAPTIVE_DEFAULTS.staleKeyAfterMs,
  limit = ADAPTIVE_DEFAULTS.maximumStaleKeysPerReview,
): string[] {
  assertNonNegativeFinite(nowMs, "Current time");
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new RangeError("Stale review interval must be a non-negative finite duration.");
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("Stale review limit must be a non-negative integer.");
  }

  return Object.entries(stats)
    .filter(([, keyStats]) => keyStats.attempts > 0 && nowMs - keyStats.lastPracticedAt >= staleAfterMs)
    .sort(
      ([leftCode, left], [rightCode, right]) =>
        left.lastPracticedAt - right.lastPracticedAt || leftCode.localeCompare(rightCode),
    )
    .slice(0, limit)
    .map(([keyCode]) => keyCode);
}

export function createSeededRandom(seed: Seed): RandomSource {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new RangeError("Numeric random seeds must be finite.");
  }
  let state =
    typeof seed === "string"
      ? hashSeed(seed)
      : seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateMadeUpWord(
  pack: AdaptiveLanguagePack,
  unlockedKeys: readonly string[],
  weakestKeyCode: string,
  random: RandomSource,
): string {
  const availableLetters = getUnlockedLetters(pack, unlockedKeys);
  const weakestLetter = getLetterForCode(pack, weakestKeyCode);
  if (!availableLetters.includes(weakestLetter)) {
    throw new RangeError("The weakest key must be among the unlocked letter keys.");
  }
  const length =
    ADAPTIVE_DEFAULTS.minimumGeneratedWordLength +
    Math.floor(
      nextRandom(random) *
        (ADAPTIVE_DEFAULTS.maximumGeneratedWordLength -
          ADAPTIVE_DEFAULTS.minimumGeneratedWordLength +
          1),
    );
  const forceWeakest =
    nextRandom(random) < ADAPTIVE_DEFAULTS.weakestKeyWordProbability;
  const forcedIndex = forceWeakest ? Math.floor(nextRandom(random) * length) : -1;
  const letters: string[] = [];

  for (let index = 0; index < length; index += 1) {
    if (index === forcedIndex) {
      letters.push(weakestLetter);
    } else if (index === 0) {
      letters.push(weightedLetter(availableLetters, pack.letterPatterns.frequencies, random));
    } else {
      const previousLetter = letters[index - 1];
      const bigramWeights = Object.fromEntries(
        availableLetters.map((letter) => [
          letter,
          pack.letterPatterns.bigrams[`${previousLetter}${letter}`] ?? 0,
        ]),
      );
      const hasBigramData = Object.values(bigramWeights).some((weight) => weight > 0);
      letters.push(
        weightedLetter(
          availableLetters,
          hasBigramData ? bigramWeights : pack.letterPatterns.frequencies,
          random,
        ),
      );
    }
  }
  return letters.join("");
}

export function generatePracticePrompt(
  pack: AdaptiveLanguagePack,
  unlockedKeys: readonly string[],
  ageBand: AdaptiveAgeBand,
  random: RandomSource,
  options: { readonly weakestKeyCode?: string; readonly wordCount?: number } = {},
): string {
  const wordCount = options.wordCount ?? ADAPTIVE_DEFAULTS.defaultPromptWordCount;
  if (!Number.isInteger(wordCount) || wordCount < 1) {
    throw new RangeError("Practice prompt word count must be a positive integer.");
  }
  const unlockedLetters = new Set(getUnlockedLetters(pack, unlockedKeys));
  if (unlockedLetters.size === 0) throw new RangeError("Unlocked keys must include a letter.");

  if (ageBand === "kids") {
    const realWords = pack.kidsWords.filter((word) =>
      splitUserPerceivedCharacters(word).every((letter) => unlockedLetters.has(letter)),
    );
    if (realWords.length === 0) {
      throw new RangeError("No Kids vocabulary words are available for the unlocked keys.");
    }
    return Array.from({ length: wordCount }, () => {
      const index = Math.floor(nextRandom(random) * realWords.length);
      return realWords[index];
    }).join(" ");
  }

  const weakestKeyCode = options.weakestKeyCode;
  if (!weakestKeyCode) {
    throw new TypeError("Standard adaptive prompts require the weakest unlocked key code.");
  }
  return Array.from({ length: wordCount }, () =>
    generateMadeUpWord(pack, unlockedKeys, weakestKeyCode, random),
  ).join(" ");
}

export interface LessonRun {
  readonly ageBand: AdaptiveAgeBand;
  readonly target: readonly string[];
  readonly cursor: number;
  readonly attempts: number;
  readonly correctAttempts: number;
  readonly lastAttemptCorrect: boolean | null;
}

export interface LessonCheckpoint {
  readonly complete: boolean;
  readonly passed: boolean;
  readonly accuracy: number;
  readonly threshold: number;
  readonly attempts: number;
}

export function createLessonRun(targetText: string, ageBand: AdaptiveAgeBand): LessonRun {
  const target = splitUserPerceivedCharacters(targetText);
  if (target.length === 0) throw new RangeError("A lesson round requires at least one character.");
  return { ageBand, target, cursor: 0, attempts: 0, correctAttempts: 0, lastAttemptCorrect: null };
}

export function submitLessonCharacter(run: LessonRun, character: string): LessonRun {
  const entered = splitUserPerceivedCharacters(character);
  if (entered.length !== 1) throw new RangeError("A lesson attempt must be one user-perceived character.");
  if (run.cursor >= run.target.length) return run;

  const correct = entered[0] === run.target[run.cursor];
  return {
    ...run,
    cursor: correct ? run.cursor + 1 : run.cursor,
    attempts: run.attempts + 1,
    correctAttempts: run.correctAttempts + (correct ? 1 : 0),
    lastAttemptCorrect: correct,
  };
}

export function getLessonCheckpoint(run: LessonRun): LessonCheckpoint {
  const complete = run.cursor === run.target.length;
  const accuracy = run.attempts === 0 ? 0 : (run.correctAttempts / run.attempts) * 100;
  const threshold =
    run.ageBand === "kids"
      ? ADAPTIVE_DEFAULTS.kidsCheckpointAccuracy
      : ADAPTIVE_DEFAULTS.standardCheckpointAccuracy;
  return {
    complete,
    passed: complete && accuracy >= threshold,
    accuracy,
    threshold,
    attempts: run.attempts,
  };
}

export function startAnotherLessonRound(run: LessonRun): LessonRun {
  return createLessonRun(run.target.join(""), run.ageBand);
}

function getUnlockedLetters(
  pack: AdaptiveLanguagePack,
  unlockedKeys: readonly string[],
): string[] {
  return [...new Set(unlockedKeys.map((keyCode) => getLetterForCode(pack, keyCode)).filter(Boolean))].filter(
    (letter) => /^[a-z]$/.test(letter),
  );
}

function getLetterForCode(pack: AdaptiveLanguagePack, keyCode: string): string {
  const definition = pack.keyMap[keyCode];
  if (!definition) throw new RangeError(`Unknown key code "${keyCode}" in adaptive language pack.`);
  return definition.unshifted;
}

function weightedLetter(
  letters: readonly string[],
  weights: Readonly<Record<string, number>>,
  random: RandomSource,
): string {
  const values = letters.map((letter) => Math.max(0, weights[letter] ?? 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const choice = nextRandom(random) * (total || letters.length);
  let cumulative = 0;
  for (let index = 0; index < letters.length; index += 1) {
    cumulative += total ? values[index] : 1;
    if (choice < cumulative) return letters[index];
  }
  return letters[letters.length - 1];
}

function nextRandom(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Random source must return a finite number in the range [0, 1).");
  }
  return value;
}

function weaknessScore(stats: KeyPracticeStats | undefined, budgetMs: number): number {
  if (!stats || stats.smoothedTimeMs === null) return Number.POSITIVE_INFINITY;
  return stats.smoothedTimeMs / budgetMs + getKeyErrorRate(stats) / ADAPTIVE_DEFAULTS.maximumErrorRate;
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
  }
  return hash >>> 0;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}
