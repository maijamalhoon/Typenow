"use client";

import { Button } from "./ui";

export type TestMode = "timed" | "words";

interface TestSetupProps {
  readonly mode: TestMode;
  readonly durationSeconds: number;
  readonly wordLimit: number;
  readonly onModeChange: (mode: TestMode) => void;
  readonly onDurationChange: (duration: number) => void;
  readonly onWordLimitChange: (count: number) => void;
  readonly onStart: () => void;
}

export function TestSetup({
  mode,
  durationSeconds,
  wordLimit,
  onModeChange,
  onDurationChange,
  onWordLimitChange,
  onStart,
}: TestSetupProps) {
  return (
    <section aria-labelledby="test-setup-heading" className="test-setup">
      <h1 id="test-setup-heading">Choose a test</h1>
      <fieldset className="test-choice-group">
        <legend>Test type</legend>
        <div className="test-choice-row">
          <label className="test-choice">
            <input
              checked={mode === "timed"}
              name="test-mode"
              onChange={() => onModeChange("timed")}
              type="radio"
            />
            <span>Timed</span>
          </label>
          <label className="test-choice">
            <input
              checked={mode === "words"}
              name="test-mode"
              onChange={() => onModeChange("words")}
              type="radio"
            />
            <span>Words</span>
          </label>
        </div>
      </fieldset>
      {mode === "timed" ? (
        <fieldset className="test-choice-group">
          <legend>Duration</legend>
          <div aria-label="Test duration" className="test-option-row">
            {[15, 30, 60, 120].map((duration) => (
              <Button
                aria-pressed={durationSeconds === duration}
                key={duration}
                onClick={() => onDurationChange(duration)}
                variant={durationSeconds === duration ? "primary" : "secondary"}
              >
                {duration} s
              </Button>
            ))}
          </div>
        </fieldset>
      ) : (
        <fieldset className="test-choice-group">
          <legend>Word count</legend>
          <div aria-label="Test word count" className="test-option-row">
            {[25, 50, 100].map((count) => (
              <Button
                aria-pressed={wordLimit === count}
                key={count}
                onClick={() => onWordLimitChange(count)}
                variant={wordLimit === count ? "primary" : "secondary"}
              >
                {count} words
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      <Button className="test-setup__start" onClick={onStart}>
        Start test
      </Button>
    </section>
  );
}
