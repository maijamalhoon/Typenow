"use client";

import { memo, useLayoutEffect, useRef } from "react";
import type { TestRun } from "@typenow/engine";

interface TypingTextProps {
  readonly ageBand: "standard" | "kids";
  readonly run: TestRun;
  readonly pendingFrameTimestamp: React.MutableRefObject<number | null>;
}

export const TypingCharacter = memo(function TypingCharacter({
  character,
  index,
  state,
}: {
  readonly character: string;
  readonly index: number;
  readonly state: "untyped" | "correct" | "error" | "current";
}) {
  return (
    <span className={`typing-character typing-character--${state}`} data-character-index={index}>
      {character === " " ? "\u00a0" : character}
    </span>
  );
});

export function TypingText({ ageBand, run, pendingFrameTimestamp }: TypingTextProps) {
  const textElementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const keyTimestamp = pendingFrameTimestamp.current;
    if (keyTimestamp === null) return;

    const element = textElementRef.current;
    if (element) {
      element.setAttribute("data-commit-index", String(run.cursor));
      element.setAttribute("data-last-commit-ms", (performance.now() - keyTimestamp).toFixed(2));
    }
    const frame = requestAnimationFrame(() => {
      const currentElement = textElementRef.current;
      if (currentElement) {
        currentElement.setAttribute("data-painted-index", String(run.cursor));
        currentElement.setAttribute(
          "data-last-paint-ms",
          (performance.now() - keyTimestamp).toFixed(2),
        );
      }
      pendingFrameTimestamp.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFrameTimestamp, run, run.cursor]);

  const windowSize = ageBand === "kids" ? 96 : 144;
  const start =
    run.cursor > (windowSize * 2) / 3
      ? run.target.lastIndexOf(" ", run.cursor - Math.floor(windowSize / 3)) + 1
      : 0;
  const end = Math.min(run.target.length, start + windowSize);
  const visibleCharacters = run.target.slice(start, end);

  return (
    <div
      aria-hidden="true"
      className={`typing-text typing-text--${ageBand}`}
      data-current-index={run.cursor}
      data-keystroke-count={run.keyStrokes.length}
      ref={textElementRef}
    >
      {visibleCharacters.map((character, offset) => {
        const index = start + offset;
        const entry = run.typed[index];
        const state =
          index === run.cursor
            ? "current"
            : entry
              ? entry.correct
                ? "correct"
                : "error"
              : "untyped";

        return (
          <TypingCharacter
            character={entry?.character ?? character}
            index={index}
            key={index}
            state={state}
          />
        );
      })}
    </div>
  );
}
