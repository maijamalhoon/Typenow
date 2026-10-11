import { countUserPerceivedCharacters, splitUserPerceivedCharacters } from "./metrics";

export interface TypedCharacter {
  readonly character: string;
  readonly correct: boolean;
  readonly code: string;
  readonly timestamp: number;
}

export interface TestRun {
  readonly target: readonly string[];
  readonly typed: readonly TypedCharacter[];
  readonly keyStrokes: readonly {
    readonly character: string;
    readonly correct: boolean;
    readonly code: string;
    readonly timestamp: number;
  }[];
  readonly cursor: number;
}

export function generateWordPrompt(
  words: readonly string[],
  wordCount: number,
  random: () => number = Math.random,
): string {
  if (!Number.isInteger(wordCount) || wordCount < 1) {
    throw new RangeError("Word count must be a positive integer.");
  }
  if (words.length === 0) throw new RangeError("At least one word is required to generate a prompt.");

  const selected: string[] = [];
  for (let index = 0; index < wordCount; index += 1) {
    const choice = random();
    if (!Number.isFinite(choice) || choice < 0 || choice >= 1) {
      throw new RangeError("The random source must return a finite number in the range [0, 1).");
    }
    selected.push(words[Math.floor(choice * words.length)]);
  }
  return selected.join(" ");
}

export function createTestRun(targetText: string): TestRun {
  return {
    target: segment(targetText),
    typed: [],
    keyStrokes: [],
    cursor: 0,
  };
}

export function applyCharacter(
  run: TestRun,
  character: string,
  code: string,
  timestamp = 0,
): TestRun {
  const entered = segment(character);
  if (entered.length !== 1 || run.cursor >= run.target.length) return run;
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new RangeError("Keystroke timestamp must be a finite, non-negative number.");
  }

  const correct = entered[0] === run.target[run.cursor];
  return {
    ...run,
    typed: [...run.typed, { character: entered[0], correct, code, timestamp }],
    keyStrokes: [...run.keyStrokes, { character: entered[0], correct, code, timestamp }],
    cursor: run.cursor + 1,
  };
}

export function applyBackspace(run: TestRun): TestRun {
  if (run.cursor === 0 || isAtWordStart(run)) return run;
  return { ...run, typed: run.typed.slice(0, -1), cursor: run.cursor - 1 };
}

function isAtWordStart(run: TestRun): boolean {
  return run.target[run.cursor - 1] === " ";
}

function segment(text: string): string[] {
  return splitUserPerceivedCharacters(text);
}

export function countCorrectCharacters(run: TestRun): number {
  return run.typed.reduce(
    (count, entry) => count + (entry.correct ? countUserPerceivedCharacters(entry.character) : 0),
    0,
  );
}
