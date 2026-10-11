export interface TestKeyStroke {
  readonly correct: boolean;
  readonly code?: string;
  readonly kind?: "character" | "modifier" | "backspace";
}

export interface TestMetricsInput {
  readonly durationMs: number;
  readonly correctCharacters: number;
  readonly keyStrokes: readonly TestKeyStroke[];
  readonly rawWpmSamples: readonly number[];
}

export interface TestMetrics {
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
  readonly consistency: number;
  readonly correctCharacters: number;
  readonly totalCharacters: number;
  readonly correctKeystrokes: number;
  readonly totalKeystrokes: number;
}

export function countUserPerceivedCharacters(text: string): number {
  return splitUserPerceivedCharacters(text).length;
}

export function splitUserPerceivedCharacters(text: string): string[] {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.normalize("NFC")),
    ({ segment }) => segment,
  );
}

export function calculateTestMetrics(input: TestMetricsInput): TestMetrics {
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new RangeError("Test duration must be a finite, non-negative number of milliseconds.");
  }
  if (!Number.isInteger(input.correctCharacters) || input.correctCharacters < 0) {
    throw new RangeError("Correct character count must be a non-negative integer.");
  }

  const characterStrokes = input.keyStrokes.filter(
    ({ kind }) => kind === undefined || kind === "character",
  );
  const totalKeystrokes = characterStrokes.length;
  const correctKeystrokes = characterStrokes.filter((stroke) => stroke.correct).length;
  const totalCharacters = totalKeystrokes;
  if (input.correctCharacters > totalCharacters) {
    throw new RangeError("Correct characters cannot exceed the number of typed characters.");
  }

  const minutes = input.durationMs / 60_000;
  const netWpm = minutes > 0 ? input.correctCharacters / 5 / minutes : 0;
  const rawWpm = minutes > 0 ? totalCharacters / 5 / minutes : 0;
  const accuracy = totalKeystrokes > 0 ? (correctKeystrokes / totalKeystrokes) * 100 : 0;
  const consistency = totalCharacters === 0 ? 0 : calculateConsistency(input.rawWpmSamples);

  return {
    netWpm,
    rawWpm,
    accuracy,
    consistency,
    correctCharacters: input.correctCharacters,
    totalCharacters,
    correctKeystrokes,
    totalKeystrokes,
  };
}

function calculateConsistency(samples: readonly number[]): number {
  const validSamples = samples.filter((sample) => Number.isFinite(sample) && sample >= 0);
  if (validSamples.length === 0) return 0;

  const mean = validSamples.reduce((sum, sample) => sum + sample, 0) / validSamples.length;
  if (mean === 0) return 100;

  const variance =
    validSamples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / validSamples.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, (1 - coefficientOfVariation) * 100));
}
