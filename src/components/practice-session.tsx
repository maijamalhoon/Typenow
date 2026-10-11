"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { englishPack } from "@typenow/language-packs";
import {
  createSeededRandom,
  generatePracticePrompt,
  getDefaultTargetWpm,
  getKeyTimeBudgetMs,
  getStaleReviewKeys,
  getUnlockedKeys,
  recordKeyAttempt,
  selectWeakestKey,
  splitUserPerceivedCharacters,
  type AdaptiveAgeBand,
  type PerKeyStats,
} from "@typenow/engine";
import {
  DEFAULT_ADAPTIVE_STATE,
  readAdaptiveState,
  saveAdaptiveState,
  type AdaptiveState,
} from "@/lib/history";
import { STORAGE_KEYS } from "@/lib/brand";
import { Button } from "./ui";
import { KeyboardMap } from "./keyboard-visuals";
import { TypingCapture } from "./typing-capture";
import { TypingCharacter } from "./typing-text";

const pack = englishPack;

function KeyText({
  target,
  cursor,
  lastWrong,
  ageBand,
}: {
  readonly target: readonly string[];
  readonly cursor: number;
  readonly lastWrong: string | null;
  readonly ageBand: AdaptiveAgeBand;
}) {
  return (
    <div aria-hidden="true" className={`typing-text typing-text--practice ${ageBand === "kids" ? "typing-text--kids" : ""}`}>
      {target.map((character, index) => (
        <TypingCharacter
          character={character}
          index={index}
          state={index < cursor ? "correct" : index === cursor ? "current" : "untyped"}
          key={index}
        />
      ))}
      {lastWrong && <span className="practice-wrong-key">{lastWrong === " " ? "Space" : lastWrong}</span>}
    </div>
  );
}

export function PracticeSession() {
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState>(DEFAULT_ADAPTIVE_STATE);
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const lastAttemptAt = useRef<number | null>(null);
  const randomSeed = useRef(0);

  const ageBand = adaptiveState.settings.ageBand;
  const targetWpm = adaptiveState.settings.targetWpm || getDefaultTargetWpm(ageBand);
  const unlockedKeys = useMemo(
    () => getUnlockedKeys(pack, adaptiveState.keyStats, targetWpm),
    [adaptiveState.keyStats, targetWpm],
  );
  const staleKeys = useMemo(
    () => getStaleReviewKeys(adaptiveState.keyStats, Date.now()),
    [adaptiveState.keyStats],
  );
  const weakestKey = useMemo(
    () => staleKeys.find((keyCode) => unlockedKeys.includes(keyCode))
      ?? selectWeakestKey(unlockedKeys, adaptiveState.keyStats, targetWpm),
    [staleKeys, unlockedKeys, adaptiveState.keyStats, targetWpm],
  );
  const expectedCode = cursor < target.length
    ? Object.values(pack.keyMap).find((key) => key.unshifted === target[cursor])?.code
    : undefined;
  const disabled = !ready || paused || target.length === 0 || cursor >= target.length;
  const totals = Object.values(adaptiveState.keyStats).reduce(
    (result, stats) => ({ attempts: result.attempts + stats.attempts, errors: result.errors + stats.errors }),
    { attempts: 0, errors: 0 },
  );
  const accuracy = totals.attempts === 0 ? 0 : Math.round(((totals.attempts - totals.errors) / totals.attempts) * 100);
  const stars = Math.round(accuracy / 20);

  const createPrompt = useCallback((state: AdaptiveState, band: AdaptiveAgeBand) => {
    const keys = getUnlockedKeys(pack, state.keyStats, state.settings.targetWpm);
    const stale = getStaleReviewKeys(state.keyStats, Date.now()).find((keyCode) => keys.includes(keyCode));
    const weakest = stale ?? selectWeakestKey(keys, state.keyStats, state.settings.targetWpm);
    const prompt = generatePracticePrompt(
      pack,
      keys,
      band,
      createSeededRandom(`practice-${Date.now()}-${randomSeed.current++}`),
      { weakestKeyCode: weakest },
    );
    setTarget(splitUserPerceivedCharacters(prompt));
    setCursor(0);
    setLastWrong(null);
    lastAttemptAt.current = performance.now();
  }, []);

  useEffect(() => {
    let active = true;
    readAdaptiveState().then((stored) => {
      if (!active) return;
      const savedAge = window.localStorage.getItem(STORAGE_KEYS.ageBand);
      const ageBandFromHome = savedAge === "kids" || savedAge === "standard" ? savedAge : stored.settings.ageBand;
      const loaded = {
        ...stored,
        settings: {
          ...stored.settings,
          ageBand: ageBandFromHome,
          targetWpm: stored.settings.targetWpm || getDefaultTargetWpm(ageBandFromHome),
        },
      };
      setAdaptiveState(loaded);
      createPrompt(loaded, ageBandFromHome);
      if (loaded.settings.ageBand !== stored.settings.ageBand) {
        saveAdaptiveState(loaded).catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not save typing mode.");
        });
      }
      setReady(true);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load practice progress.");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [createPrompt]);

  const handleCharacter = useCallback((character: string, code: string, timestamp: number) => {
    if (cursor >= target.length || !expectedCode) return;
    const entered = splitUserPerceivedCharacters(character);
    if (entered.length !== 1) return;
    const correct = entered[0] === target[cursor];
    const elapsed = lastAttemptAt.current === null ? 0 : Math.max(0, timestamp - lastAttemptAt.current);
    const attemptedCode = correct
      ? expectedCode
      : code in pack.keyMap
        ? code
        : expectedCode;
    const keyStats: PerKeyStats = recordKeyAttempt(
      adaptiveState.keyStats,
      attemptedCode,
      elapsed,
      correct,
      Date.now(),
    );
    const nextState = { ...adaptiveState, keyStats };
    setAdaptiveState(nextState);
    setLastWrong(correct ? null : entered[0]);
    lastAttemptAt.current = timestamp;
    if (correct) setCursor((index) => index + 1);
    saveAdaptiveState(nextState).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not save practice progress.");
    });
  }, [adaptiveState, cursor, expectedCode, target]);

  useEffect(() => {
    if (target.length > 0 && cursor >= target.length) setNotice("Round complete. Your key practice has been saved.");
  }, [cursor, target.length]);

  return (
    <section aria-labelledby="practice-heading" className="practice-session">
      <div className="practice-heading">
        <div>
          <span className="eyebrow">Practice · {ageBand === "kids" ? "Kids" : "Standard"}</span>
          <h1 id="practice-heading">Steady key practice</h1>
        </div>
        <Link className="text-link" href="/progress/">Key progress</Link>
      </div>
      <div aria-live="polite" className="practice-status">
        {ageBand === "kids"
          ? <span aria-label={`Accuracy ${accuracy} percent, ${stars} out of 5 stars`}>Accuracy {totals.attempts ? `${accuracy}%` : "—"} · {"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
          : `Target ${targetWpm} WPM · ${Math.round(getKeyTimeBudgetMs(targetWpm))} ms per key`}
      </div>
      {ageBand === "standard" && (
        <label className="target-speed">
          Target speed
          <select
            value={targetWpm}
            onChange={(event) => {
              const nextState = {
                ...adaptiveState,
                settings: { ...adaptiveState.settings, targetWpm: Number(event.currentTarget.value) },
              };
              setAdaptiveState(nextState);
              saveAdaptiveState(nextState).catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : "Could not save the target speed.");
              });
            }}
          >
            {[15, 20, 25, 30, 40, 50].map((speed) => <option key={speed} value={speed}>{speed} WPM</option>)}
          </select>
        </label>
      )}
      {error && <p className="history-error" role="alert">{error}</p>}
      {target.length > 0 ? (
        <>
          <div className="practice-text-wrap" onClick={() => document.getElementById("typing-capture-input")?.focus()}>
            <KeyText ageBand={ageBand} cursor={cursor} lastWrong={lastWrong} target={target} />
          </div>
          {lastWrong && expectedCode && (
            <p className="practice-error" role="status">
              {lastWrong === " " ? "Space" : lastWrong} was not the target. Type {pack.keyMap[expectedCode].label} to continue.
            </p>
          )}
          <KeyboardMap nextCode={expectedCode} pack={pack} />
          <TypingCapture
            allowBackspace={false}
            inputLabel="Type the highlighted key"
            onBackspace={() => {}}
            onCharacter={handleCharacter}
            onPause={() => setPaused(true)}
            paused={disabled}
          />
          {cursor < target.length && (
            <Button onClick={() => setPaused((value) => !value)} variant="secondary">
              {paused ? "Resume practice" : "Pause practice"}
            </Button>
          )}
          {cursor >= target.length && (
            <div className="practice-round-complete">
              <p role="status">{notice}</p>
              <Button onClick={() => createPrompt(adaptiveState, ageBand)}>Another round</Button>
            </div>
          )}
        </>
      ) : ready ? (
        <div className="practice-empty">
          <p>No real Kids words are available with the currently unlocked keys.</p>
          <p>Complete the home-row lessons to open a useful word set.</p>
          <Link className="text-link" href="/learn/">Open Learn</Link>
        </div>
      ) : (
        <p role="status">Loading local practice progress…</p>
      )}
      <p className="physical-note">A physical keyboard is needed to type. Backspace is off in Practice.</p>
    </section>
  );
}
