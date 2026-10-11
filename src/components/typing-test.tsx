"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyBackspace,
  applyCharacter,
  calculateTestMetrics,
  countCorrectCharacters,
  createTestRun,
  generateWordPrompt,
} from "@typenow/engine";
import type { TestRun } from "@typenow/engine";
import { englishPack, KIDS_MODE_ENABLED } from "@typenow/language-packs";
import { STORAGE_KEYS } from "@/lib/brand";
import { saveTestHistory, type SaveHistoryResult } from "@/lib/history";
import { TestResults, type SpeedSample, type TestHistorySaveStatus } from "./test-results";
import { TestSetup, type TestMode } from "./test-setup";
import { TypingCapture } from "./typing-capture";
import { TypingText } from "./typing-text";
import { Button } from "./ui";

type TestStatus = "setup" | "running" | "paused" | "finished";

export function TypingTest() {
  const [run, setRun] = useState<TestRun>(() => createTestRun(""));
  const [status, setStatus] = useState<TestStatus>("setup");
  const [mode, setMode] = useState<TestMode>("timed");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [wordLimit, setWordLimit] = useState(25);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(30_000);
  const [ageBand, setAgeBand] = useState<"standard" | "kids">("standard");
  const [speedSamples, setSpeedSamples] = useState<SpeedSample[]>([]);
  const [historySave, setHistorySave] = useState<TestHistorySaveStatus>({ status: "saving" });
  const pendingFrameTimestamp = useRef<number | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const historyRecordIdRef = useRef<string | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const lastSampleElapsedRef = useRef(0);
  const lastSampleCharacterCountRef = useRef(0);
  const runRef = useRef(run);
  runRef.current = run;

  const appendSpeedSample = useCallback((sampleTimeMs: number) => {
    const intervalMs = sampleTimeMs - lastSampleElapsedRef.current;
    if (intervalMs < 1_000) return;
    const currentCount = runRef.current.keyStrokes.length;
    const rawWpm =
      (currentCount - lastSampleCharacterCountRef.current) / 5 / (intervalMs / 60_000);
    setSpeedSamples((current) => [...current, { elapsedMs: sampleTimeMs, rawWpm }]);
    lastSampleElapsedRef.current = sampleTimeMs;
    lastSampleCharacterCountRef.current = currentCount;
  }, []);

  const startTest = useCallback((nextMode: TestMode, nextDuration: number, nextWordLimit: number) => {
    const wordCount = nextMode === "timed" ? 2_000 : nextWordLimit;
    const savedAgeBand = window.localStorage.getItem(STORAGE_KEYS.ageBand);
    const useKidsWords = KIDS_MODE_ENABLED && savedAgeBand === "kids";
    const target = generateWordPrompt(useKidsWords ? englishPack.kidsWords : englishPack.words, wordCount);
    const now = performance.now();
    historyRecordIdRef.current = crypto.randomUUID();
    setHistorySave({ status: "saving" });
    setMode(nextMode);
    setDurationSeconds(nextDuration);
    setWordLimit(nextWordLimit);
    setRun(createTestRun(target));
    setSpeedSamples([]);
    setElapsedMs(0);
    setRemainingMs(nextDuration * 1_000);
    elapsedBeforePauseRef.current = 0;
    lastSampleElapsedRef.current = 0;
    lastSampleCharacterCountRef.current = 0;
    runStartedAtRef.current = now;
    setStatus("running");
  }, []);

  useEffect(() => {
    const savedAgeBand = window.localStorage.getItem(STORAGE_KEYS.ageBand);
    if (savedAgeBand === "standard" || savedAgeBand === "kids")     if (KIDS_MODE_ENABLED && savedAgeBand === "kids") setAgeBand("kids");
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("start") === "1") startTest("timed", 30, 25);
  }, [startTest]);

  useEffect(() => {
    if (status !== "running") return;

    const updateElapsedTime = () => {
      const start = runStartedAtRef.current;
      if (start === null) return;
      const elapsed = elapsedBeforePauseRef.current + performance.now() - start;
      setElapsedMs(elapsed);

      if (mode === "timed") {
        const remaining = Math.max(0, durationSeconds * 1_000 - elapsed);
        setRemainingMs(remaining);
        if (remaining === 0) {
          appendSpeedSample(durationSeconds * 1_000);
          elapsedBeforePauseRef.current = durationSeconds * 1_000;
          runStartedAtRef.current = null;
          setElapsedMs(durationSeconds * 1_000);
          setStatus("finished");
        } else if (elapsed - lastSampleElapsedRef.current >= 1_000) {
          appendSpeedSample(elapsed);
        }
      } else if (elapsed - lastSampleElapsedRef.current >= 1_000) {
        appendSpeedSample(elapsed);
      }
    };

    const interval = window.setInterval(updateElapsedTime, 250);
    return () => window.clearInterval(interval);
  }, [appendSpeedSample, durationSeconds, mode, status]);

  useEffect(() => {
    if (status !== "running" || mode !== "words" || run.cursor < run.target.length) return;

    const now = performance.now();
    const start = runStartedAtRef.current;
    if (start !== null) {
      const elapsed = elapsedBeforePauseRef.current + now - start;
      elapsedBeforePauseRef.current = elapsed;
      setElapsedMs(elapsed);
      appendSpeedSample(elapsed);
      runStartedAtRef.current = null;
    }
    setStatus("finished");
  }, [appendSpeedSample, mode, run.cursor, run.target.length, status]);

  useEffect(() => {
    if (status !== "finished") return;

    const keyErrors: Record<string, number> = {};
    for (const stroke of run.keyStrokes) {
      if (stroke.correct) continue;
      keyErrors[stroke.code] = (keyErrors[stroke.code] ?? 0) + 1;
    }
    const totalCharacters = run.keyStrokes.length;
    const recordId = historyRecordIdRef.current;
    if (recordId === null) {
      setHistorySave({ status: "error", message: "This result could not be assigned a history ID." });
      return;
    }

    void saveTestHistory({
      id: recordId,
      completedAt: new Date().toISOString(),
      durationMs: elapsedMs,
      mode,
      modeValue: mode === "timed" ? durationSeconds : wordLimit,
      metrics: calculateTestMetrics({
        durationMs: elapsedMs,
        correctCharacters: countCorrectCharacters(run),
        keyStrokes: run.keyStrokes,
        rawWpmSamples: speedSamples.map(({ rawWpm }) => rawWpm),
      }),
      keyErrors,
    }).then(
      (result: SaveHistoryResult) => {
        setHistorySave({ status: result.saved ? "saved" : "not-saved" });
      },
      (cause: unknown) => {
        setHistorySave({
          status: "error",
          message: cause instanceof Error ? cause.message : "Unable to save this test to local history.",
        });
      },
    );
  }, [durationSeconds, elapsedMs, mode, run, speedSamples, status, wordLimit]);

  const pauseTest = useCallback(() => {
    if (status !== "running") return;
    const now = performance.now();
    const start = runStartedAtRef.current;
    if (start !== null) {
      elapsedBeforePauseRef.current += now - start;
      runStartedAtRef.current = null;
      setElapsedMs(elapsedBeforePauseRef.current);
      appendSpeedSample(elapsedBeforePauseRef.current);
      if (mode === "timed") {
        const remaining = Math.max(0, durationSeconds * 1_000 - elapsedBeforePauseRef.current);
        setRemainingMs(remaining);
        if (remaining === 0) {
          elapsedBeforePauseRef.current = durationSeconds * 1_000;
          setElapsedMs(durationSeconds * 1_000);
          setStatus("finished");
          return;
        }
      }
    }
    setStatus("paused");
  }, [appendSpeedSample, durationSeconds, mode, status]);

  const resumeTest = useCallback(() => {
    if (status !== "paused") return;
    runStartedAtRef.current = performance.now();
    setStatus("running");
  }, [status]);

  const handleCharacter = useCallback((character: string, code: string, timestamp: number) => {
    pendingFrameTimestamp.current = timestamp;
    setRun((current) => applyCharacter(current, character, code, timestamp));
  }, []);

  const handleBackspace = useCallback((timestamp: number) => {
    pendingFrameTimestamp.current = timestamp;
    setRun((current) => applyBackspace(current));
  }, []);

  if (status === "setup") {
    return (
      <TestSetup
        durationSeconds={durationSeconds}
        mode={mode}
        onDurationChange={setDurationSeconds}
        onModeChange={setMode}
        onStart={() => startTest(mode, durationSeconds, wordLimit)}
        onWordLimitChange={setWordLimit}
        wordLimit={wordLimit}
      />
    );
  }

  if (status === "finished") {
    const metrics = calculateTestMetrics({
      durationMs: elapsedMs,
      correctCharacters: countCorrectCharacters(run),
      keyStrokes: run.keyStrokes,
      rawWpmSamples: speedSamples.map(({ rawWpm }) => rawWpm),
    });
    return (
      <TestResults
        durationMs={elapsedMs}
        metrics={metrics}
        modeLabel={mode === "timed" ? `${durationSeconds}-second test` : `${wordLimit}-word test`}
        historySave={historySave}
        onAgain={() => {
          setRun(createTestRun(""));
          setSpeedSamples([]);
          setStatus("setup");
        }}
        run={run}
        speedSamples={speedSamples}
      />
    );
  }

  const metrics = calculateTestMetrics({
    durationMs: elapsedMs,
    correctCharacters: countCorrectCharacters(run),
    keyStrokes: run.keyStrokes,
    rawWpmSamples: speedSamples.map(({ rawWpm }) => rawWpm),
  });
  const progress = run.target.length === 0 ? 0 : (run.cursor / run.target.length) * 100;
  const wordProgress = countCompletedWords(run);

  return (
    <section
      className={`typing-screen${status === "paused" ? " typing-screen--paused" : ""}`}
      data-testid="typing-screen"
    >
      <div className="test-active-bar">
        <output aria-live="off" className="test-counter" data-testid="test-counter">
          {mode === "timed" ? formatCountdown(remainingMs) : `${wordProgress} / ${wordLimit} words`}
        </output>
        <Button
          aria-label={status === "running" ? "Pause test" : "Resume test"}
          onClick={status === "running" ? pauseTest : resumeTest}
          variant="secondary"
        >
          {status === "running" ? "Pause" : "Resume"}
        </Button>
      </div>
      <div className="typing-reading">
        <TypingText ageBand={ageBand} pendingFrameTimestamp={pendingFrameTimestamp} run={run} />
      </div>
      <div aria-label="Live typing results" className="typing-readout">
        {ageBand === "standard" && (
          <span>
            Speed <strong>{metrics.netWpm.toFixed(0)} WPM</strong>
          </span>
        )}
        <span>
          Accuracy <strong>{metrics.accuracy.toFixed(0)}%</strong>
        </span>
      </div>
      <div
        aria-label="Typing progress"
        className="typing-progress"
        role="progressbar"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress)}
      >
        <span className="typing-progress__fill" style={{ width: `${progress}%` }} />
      </div>
      {status === "paused" && <p aria-live="polite" className="test-paused">Paused</p>}
      <TypingCapture
        onBackspace={handleBackspace}
        onCharacter={handleCharacter}
        onPause={pauseTest}
        paused={status !== "running"}
      />
    </section>
  );
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function countCompletedWords(run: TestRun): number {
  let spaces = 0;
  for (let index = 0; index < run.cursor; index += 1) {
    if (run.target[index] === " ") spaces += 1;
  }
  return spaces + (run.cursor === run.target.length && run.target.length > 0 ? 1 : 0);
}
