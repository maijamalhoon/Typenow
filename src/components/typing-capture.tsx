"use client";

import { useEffect, useRef } from "react";
import { splitUserPerceivedCharacters } from "@typenow/engine";

interface TypingCaptureProps {
  readonly paused: boolean;
  readonly onCharacter: (character: string, code: string, timestamp: number) => void;
  readonly onBackspace: (timestamp: number) => void;
  readonly onPause: () => void;
  readonly allowBackspace?: boolean;
  readonly inputLabel?: string;
}

export function TypingCapture({
  paused,
  onCharacter,
  onBackspace,
  onPause,
  allowBackspace = true,
  inputLabel = "Type the displayed text",
}: TypingCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCodeRef = useRef("Unidentified");
  const composingRef = useRef(false);
  const completedCompositionRef = useRef<{ readonly text: string; readonly timestamp: number } | undefined>(
    undefined,
  );
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  useEffect(() => {
    if (!paused) inputRef.current?.focus();
  }, [paused]);

  useEffect(() => {
    const pauseWhenWindowBlurs = () => onPauseRef.current();
    window.addEventListener("blur", pauseWhenWindowBlurs);
    return () => window.removeEventListener("blur", pauseWhenWindowBlurs);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    function handleBeforeInput(event: InputEvent) {
      event.preventDefault();
      if (paused || composingRef.current || !event.data) return;
      if (event.inputType !== "insertText" && event.inputType !== "insertFromComposition") return;

      if (event.inputType === "insertFromComposition") {
        const completed = completedCompositionRef.current;
        if (completed?.text === event.data && performance.now() - completed.timestamp < 500) {
          completedCompositionRef.current = undefined;
          return;
        }
      }

      const code = lastCodeRef.current;
      for (const character of splitUserPerceivedCharacters(event.data)) {
        onCharacter(character, code, performance.now());
      }
      lastCodeRef.current = "Unidentified";
    }

    input.addEventListener("beforeinput", handleBeforeInput);
    return () => input.removeEventListener("beforeinput", handleBeforeInput);
  }, [allowBackspace, onBackspace, onCharacter, paused]);

  return (
    <div className="typing-capture">
      <label className="visually-hidden" htmlFor="typing-capture-input">
        {inputLabel}
      </label>
      <input
        ref={inputRef}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="typing-capture__input"
        disabled={paused}
        id="typing-capture-input"
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          const typingRegion = event.currentTarget.closest(
            ".typing-screen, .practice-session, .learn-lesson",
          );
          if (
            nextFocus instanceof HTMLElement &&
            typingRegion?.contains(nextFocus)
          ) {
            return;
          }
          onPause();
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          const text = event.data;
          if (!text || paused) return;
          const timestamp = performance.now();
          completedCompositionRef.current = { text, timestamp };
          for (const character of splitUserPerceivedCharacters(text)) {
            onCharacter(character, "Unidentified", performance.now());
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onKeyDown={(event) => {
          if (composingRef.current || paused) return;
          if (event.repeat) {
            event.preventDefault();
            return;
          }
          if (event.key === "Dead") {
            event.preventDefault();
            lastCodeRef.current = "Unidentified";
            return;
          }
          if (event.key === "Backspace") {
            event.preventDefault();
            if (allowBackspace) onBackspace(performance.now());
            return;
          }
          if (event.key.length === 1 || event.code === "Space") {
            lastCodeRef.current = event.code || "Unidentified";
          }
        }}
        onPaste={(event) => event.preventDefault()}
        onInput={(event) => {
          event.currentTarget.value = "";
        }}
        inputMode="text"
        spellCheck={false}
        type="text"
      />
    </div>
  );
}
