"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { englishPack, KIDS_MODE_ENABLED } from "@typenow/language-packs";
import {
  createSeededRandom,
  generatePracticePrompt,
  getDefaultTargetWpm,
  getKeyTimeBudgetMs,
  getPracticeTimeSample,
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
  saveAdaptiveKeyStats,
  saveAdaptiveState,
  type AdaptiveState,
} from "@/lib/history";
import { STORAGE_KEYS } from "@/lib/brand";
import { Button } from "./ui";
import { KeyboardMap } from "./keyboard-visuals";
import { TypingCapture } from "./typing-capture";
import { TypingCharacter } from "./typing-text";

const pack = englishPack;
const keyCodeByCharacter = new Map<string, string>(
  Object.values(pack.keyMap).map((key) => [key.unshifted, key.code]),
);

function KeyText({
  target,
  cursor,
  lastWrong,
  ageBand,
  pendingTimestamp,
}: {
  readonly target: readonly string[];
  readonly cursor: number;
  readonly lastWrong: string | null;
  readonly ageBand: AdaptiveAgeBand;
  readonly pendingTimestamp: React.MutableRefObject<number | null>;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const commitSequence = useRef(0);
  useLayoutEffect(() => {
    const timestamp = pendingTimestamp.current;
    if (timestamp === null) return;
    const element = textRef.current;
    if (!element) return;
    element.dataset.commitIndex = String(cursor);
    element.dataset.commitSequence = String(++commitSequence.current);
    element.dataset.keypressTimestamp = String(timestamp);
    element.dataset.lastCommitMs = (performance.now() - timestamp).toFixed(2);
    const frame = requestAnimationFrame(() => {
      if (!textRef.current) return;
      textRef.current.dataset.paintedIndex = String(cursor);
      textRef.current.dataset.lastPaintMs = (performance.now() - timestamp).toFixed(2);
      pendingTimestamp.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [cursor, pendingTimestamp]);

  return (
    <div
      aria-hidden="true"
      className={`typing-text typing-text--practice ${ageBand === "kids" ? "typing-text--kids" : ""}`}
      data-current-index={cursor}
      data-commit-sequence="0"
      ref={textRef}
    >
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
  const [roundAttempts, setRoundAttempts] = useState(0);
  const [roundErrors, setRoundErrors] = useState(0);
  const [promptError, setPromptError] = useState("");
  const adaptiveStateRef = useRef<AdaptiveState>(DEFAULT_ADAPTIVE_STATE);
  const keyStatsRef = useRef<PerKeyStats>({});
  const targetRef = useRef<readonly string[]>([]);
  const cursorRef = useRef(0);
  const lastCorrectAt = useRef<number | null>(null);
  const dirtyKeyCodes = useRef(new Set<string>());
  const flushInProgress = useRef<Promise<void> | null>(null);
  const pendingFrameTimestamp = useRef<number | null>(null);
  const randomSeed = useRef(0);

  const ageBand = KIDS_MODE_ENABLED && adaptiveState.settings.ageBand === "kids" ? "kids" : "standard";
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
    () => staleKeys.find((keyCode) => unlockedKeys.includes(keyCode) && /^Key[a-z]$/i.test(keyCode))
      ?? selectWeakestKey(unlockedKeys, adaptiveState.keyStats, targetWpm),
    [staleKeys, unlockedKeys, adaptiveState.keyStats, targetWpm],
  );
  const expectedCode = cursor < target.length ? keyCodeByCharacter.get(target[cursor]) : undefined;
  const disabled = !ready || paused || target.length === 0 || cursor >= target.length;
  const accuracy = roundAttempts === 0 ? 0 : Math.round(((roundAttempts - roundErrors) / roundAttempts) * 100);
  const stars = Math.round(accuracy / 20);

  const createPrompt = useCallback((state: AdaptiveState, band: AdaptiveAgeBand) => {
    try {
      const effectiveBand = KIDS_MODE_ENABLED ? band : "standard";
      const keys = getUnlockedKeys(pack, keyStatsRef.current, state.settings.targetWpm);
      const stale = getStaleReviewKeys(keyStatsRef.current, Date.now()).find(
        (keyCode) => keys.includes(keyCode) && /^Key[a-z]$/i.test(keyCode),
      );
      const weakest = stale ?? selectWeakestKey(keys, keyStatsRef.current, state.settings.targetWpm);
      const prompt = generatePracticePrompt(
        pack,
        keys,
        effectiveBand,
        createSeededRandom(`practice-${Date.now()}-${randomSeed.current++}`),
        { weakestKeyCode: weakest },
      );
      const characters = splitUserPerceivedCharacters(prompt);
      targetRef.current = characters;
      cursorRef.current = 0;
      setTarget(characters);
      setCursor(0);
      setLastWrong(null);
      setRoundAttempts(0);
      setRoundErrors(0);
      setPromptError("");
      lastCorrectAt.current = null;
    } catch (cause) {
      targetRef.current = [];
      cursorRef.current = 0;
      setTarget([]);
      setCursor(0);
      setPromptError(cause instanceof Error ? cause.message : "Could not create a practice prompt.");
    }
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
          ageBand: KIDS_MODE_ENABLED ? ageBandFromHome : "standard",
          targetWpm: stored.settings.targetWpm || getDefaultTargetWpm(KIDS_MODE_ENABLED ? ageBandFromHome : "standard"),
        },
      };
      adaptiveStateRef.current = loaded;
      keyStatsRef.current = loaded.keyStats;
      setAdaptiveState(loaded);
      createPrompt(loaded, loaded.settings.ageBand);
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

  const flushDirtyKeyStats = useCallback(async (): Promise<void> => {
    if (flushInProgress.current) {
      await flushInProgress.current;
      if (dirtyKeyCodes.current.size > 0) await flushDirtyKeyStats();
      return;
    }
    const changed = [...dirtyKeyCodes.current];
    if (changed.length === 0) return;
    changed.forEach((keyCode) => dirtyKeyCodes.current.delete(keyCode));
    const snapshot = keyStatsRef.current;
    const pending = saveAdaptiveKeyStats(snapshot, changed);
    flushInProgress.current = pending;
    try {
      await pending;
    } catch (cause) {
      changed.forEach((keyCode) => dirtyKeyCodes.current.add(keyCode));
      throw cause;
    } finally {
      flushInProgress.current = null;
    }
    if (dirtyKeyCodes.current.size > 0) await flushDirtyKeyStats();
  }, []);

  const handlePause = useCallback(() => {
    lastCorrectAt.current = null;
    setPaused(true);
    void flushDirtyKeyStats().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not save practice progress.");
    });
  }, [flushDirtyKeyStats]);

  const handleCharacter = useCallback((character: string, _code: string, timestamp: number) => {
    const currentCursor = cursorRef.current;
    const currentTarget = targetRef.current;
    if (currentCursor >= currentTarget.length) return;
    const entered = splitUserPerceivedCharacters(character);
    if (entered.length !== 1) return;
    const expectedCharacter = currentTarget[currentCursor];
    const expectedCode = keyCodeByCharacter.get(expectedCharacter);
    if (!expectedCode) return;
    pendingFrameTimestamp.current = timestamp;
    const correct = entered[0] === expectedCharacter;
    const elapsed = getPracticeTimeSample(lastCorrectAt.current, timestamp, correct);
    const nextStats = recordKeyAttempt(keyStatsRef.current, expectedCode, elapsed, correct, Date.now());
    keyStatsRef.current = nextStats;
    dirtyKeyCodes.current.add(expectedCode);
    setLastWrong(correct ? null : entered[0]);
    setRoundAttempts((attempts) => attempts + 1);
    if (!correct) setRoundErrors((errors) => errors + 1);
    if (correct) {
      lastCorrectAt.current = timestamp;
      cursorRef.current += 1;
      setCursor(cursorRef.current);
    }
  }, []);

  useEffect(() => {
    if (target.length === 0 || cursor < target.length) return;
    setNotice("Round complete. Your key practice has been saved.");
    const nextState = { ...adaptiveStateRef.current, keyStats: keyStatsRef.current };
    adaptiveStateRef.current = nextState;
    setAdaptiveState(nextState);
    void flushDirtyKeyStats().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not save practice progress.");
    });
  }, [cursor, flushDirtyKeyStats, target.length]);

  useEffect(() => {
    const flushOnExit = () => {
      lastCorrectAt.current = null;
      void flushDirtyKeyStats().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not save practice progress.");
      });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushOnExit();
    };
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [flushDirtyKeyStats]);

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
          ? <span aria-label={`Round accuracy ${accuracy} percent, ${stars} out of 5 stars`}>Accuracy {roundAttempts ? `${accuracy}%` : "—"} · {"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
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
              adaptiveStateRef.current = nextState;
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
      {promptError && (
        <div className="practice-empty" role="alert">
          <p>Could not create a practice prompt: {promptError}</p>
          <Button onClick={() => createPrompt(adaptiveState, ageBand)}>Retry</Button>
        </div>
      )}
      {target.length > 0 ? (
        <>
          <div className="practice-text-wrap" onClick={() => document.getElementById("typing-capture-input")?.focus()}>
            <KeyText
              ageBand={ageBand}
              cursor={cursor}
              lastWrong={lastWrong}
              pendingTimestamp={pendingFrameTimestamp}
              target={target}
            />
          </div>
          {lastWrong && expectedCode && (
            <p className="practice-error" role="status">
              {lastWrong === " " ? "Space" : lastWrong} was not the target. Type {target[cursor] === " " ? "Space" : target[cursor].toUpperCase()} to continue.
            </p>
          )}
          <KeyboardMap nextCode={expectedCode} pack={pack} />
          <TypingCapture
            allowBackspace={false}
            inputLabel="Type the highlighted key"
            onBackspace={() => {}}
            onCharacter={handleCharacter}
            onPause={handlePause}
            paused={disabled}
          />
          {cursor < target.length && (
            <Button
              onClick={() => {
                if (paused) {
                  lastCorrectAt.current = null;
                  setPaused(false);
                } else {
                  handlePause();
                }
              }}
              variant="secondary"
            >
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
        <p>{promptError ? "This prompt could not be created." : "No practice prompt is available."}</p>
        {!promptError && <Link className="text-link" href="/learn/">Open Learn</Link>}
        </div>
      ) : (
        <p role="status">Loading local practice progress…</p>
      )}
      <p className="physical-note">A physical keyboard is needed to type. Backspace is off in Practice.</p>
    </section>
  );
}
