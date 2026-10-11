"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { englishPack, type LanguagePack } from "@typenow/language-packs";
import { KIDS_MODE_ENABLED } from "@typenow/language-packs";
import {
  createLessonRun,
  getLessonCheckpoint,
  startAnotherLessonRound,
  submitLessonCharacter,
  type LessonRun,
} from "@typenow/engine";
import {
  DEFAULT_ADAPTIVE_STATE,
  readAdaptiveState,
  saveAdaptiveState,
  type AdaptiveState,
} from "@/lib/history";
import { STORAGE_KEYS } from "@/lib/brand";
import { createWordPracticeTarget } from "@/lib/lesson-content";
import { Button } from "./ui";
import { HandMap, KeyboardMap } from "./keyboard-visuals";
import { TypingCapture } from "./typing-capture";
import { TypingCharacter } from "./typing-text";

type LessonStage = {
  readonly id: string;
  readonly title: string;
  readonly keys: readonly string[];
};
type LessonPhase = "intro" | "guided" | "word-practice" | "checkpoint" | "summary";
const pack: LanguagePack = englishPack;

function createStages(): LessonStage[] {
  const stages: LessonStage[] = [];
  const groups = [
    { id: "home-row", title: "Home row", match: (code: string) => pack.keyMap[code].row === "home" && /^[a-z]$/.test(pack.keyMap[code].unshifted) },
    { id: "top-row", title: "Top row", match: (code: string) => pack.keyMap[code].row === "top" },
    { id: "bottom-row", title: "Bottom row", match: (code: string) => pack.keyMap[code].row === "bottom" && /^[a-z]$/.test(pack.keyMap[code].unshifted) },
    { id: "space", title: "Space and word flow", match: (code: string) => code === "Space" },
  ];
  for (const group of groups) {
    const keys = pack.unlockOrder.filter(group.match);
    if (keys.length) stages.push({ id: group.id, title: group.title, keys });
  }
  const capitals = pack.unlockOrder.filter((code) => /^[a-z]$/.test(pack.keyMap[code].unshifted));
  if (capitals.length) stages.push({ id: "capitals", title: "Capitals with Shift", keys: capitals });
  const marks = ["Period", "Comma", "Quote", "Slash", "Semicolon"].filter((code) => code in pack.keyMap);
  if (marks.length) stages.push({ id: "marks", title: "Basic punctuation", keys: marks });
  return stages;
}

const stages = createStages();

function stageTarget(stage: LessonStage, shifted = false): string {
  const characters = stage.keys.map((code) => {
    const key = pack.keyMap[code];
    if (stage.id === "marks" && code === "Slash") return key.shifted ?? key.unshifted;
    return shifted ? key.shifted ?? key.unshifted.toUpperCase() : key.unshifted;
  });
  return [...characters, ...characters].join("");
}

function keyCodeFor(character: string): string | undefined {
  return Object.values(pack.keyMap).find(
    (key) => key.unshifted === character || key.shifted === character,
  )?.code;
}

export function LearnCenter() {
  const [state, setState] = useState<AdaptiveState>(DEFAULT_ADAPTIVE_STATE);
  const [phase, setPhase] = useState<LessonPhase | null>(null);
  const [stageId, setStageId] = useState("");
  const [run, setRun] = useState<LessonRun | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lessonPaused, setLessonPaused] = useState(false);
  const typingDisplayRef = useRef<HTMLDivElement>(null);
  const pendingTypingTimestamp = useRef<number | null>(null);
  const commitSequence = useRef(0);
  const ageBand = KIDS_MODE_ENABLED && state.settings.ageBand === "kids" ? "kids" : "standard";
  const randomSequence = useRef(0);

  const nextLessonSeed = () => `learn-${Date.now()}-${randomSequence.current++}`;

  useEffect(() => {
    let active = true;
    readAdaptiveState().then((saved) => {
      if (!active) return;
      const preference = window.localStorage.getItem(STORAGE_KEYS.ageBand);
      const ageBand = KIDS_MODE_ENABLED && preference === "kids" ? "kids" : "standard";
      setState({ ...saved, settings: { ...saved.settings, ageBand } });
      const requestedStage = new URLSearchParams(window.location.search).get("stage");
      if (requestedStage && stages.some(({ id }) => id === requestedStage)) {
        const requestedIndex = stages.findIndex(({ id }) => id === requestedStage);
        const savedIndex = stages.findIndex(({ id }) => id === saved.learnProgress.currentStage);
        if (requestedIndex <= Math.max(0, savedIndex)) {
          setStageId(requestedStage);
          setPhase("intro");
        }
      }
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load Learn progress."));
    return () => {
      active = false;
    };
  }, []);

  const stageIndex = stages.findIndex(({ id }) => id === state.learnProgress.currentStage);
  const currentIndex = stageIndex < 0 ? 0 : stageIndex;
  const stage = stages.find(({ id }) => id === stageId);
  const selectedRun = run;
  const currentCharacter = selectedRun?.target[selectedRun.cursor];
  const nextCode = currentCharacter ? keyCodeFor(currentCharacter) : undefined;

  useLayoutEffect(() => {
    const timestamp = pendingTypingTimestamp.current;
    const element = typingDisplayRef.current;
    if (timestamp === null || !element) return;
    element.dataset.currentIndex = String(run?.cursor ?? 0);
    element.dataset.commitIndex = String(run?.cursor ?? 0);
    element.dataset.commitSequence = String(++commitSequence.current);
    element.dataset.keypressTimestamp = String(timestamp);
    element.dataset.lastCommitMs = (performance.now() - timestamp).toFixed(2);
    const frame = requestAnimationFrame(() => {
      if (!typingDisplayRef.current) return;
      typingDisplayRef.current.dataset.lastPaintMs = (performance.now() - timestamp).toFixed(2);
      pendingTypingTimestamp.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, run]);

  const startStage = (selected: LessonStage) => {
    setStageId(selected.id);
    setRun(null);
    setPhase("intro");
    setMessage("");
    setError("");
    setLessonPaused(false);
  };

  const submitCharacter = useCallback((character: string, timestamp: number) => {
    if (!run || !stage || (phase !== "guided" && phase !== "word-practice" && phase !== "checkpoint")) return;
    pendingTypingTimestamp.current = timestamp;
    const updated = submitLessonCharacter(run, character);
    setRun(updated);
    setMessage(updated.lastAttemptCorrect === false ? "Not that key. The current key stays highlighted." : "");
    if (updated.cursor !== updated.target.length) return;
    if (phase === "guided") {
      try {
        setRun(createLessonRun(
          createWordPracticeTarget(pack, stage.keys, ageBand, 30, nextLessonSeed()),
          ageBand,
        ));
        setPhase("word-practice");
      } catch (cause) {
        setRun(run);
        setError(cause instanceof Error ? cause.message : "Could not create lesson words.");
        return;
      }
      setMessage("");
      return;
    }
    if (phase === "word-practice") {
      try {
        setRun(createLessonRun(
          createWordPracticeTarget(pack, stage.keys, ageBand, 40, nextLessonSeed()),
          ageBand,
        ));
        setPhase("checkpoint");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create a checkpoint.");
        return;
      }
      setMessage("");
      return;
    }
    const checkpoint = getLessonCheckpoint(updated);
    if (!checkpoint.passed) {
      setMessage(`Accuracy ${Math.round(checkpoint.accuracy)}%. Try another round; speed is not part of this checkpoint.`);
      setRun(updated);
      setPhase("summary");
      return;
    }
    const nextStage = stages[stages.findIndex(({ id }) => id === stage.id) + 1];
    const nextState: AdaptiveState = {
      ...state,
      learnProgress: {
        completedStages: [...new Set([...state.learnProgress.completedStages, stage.id])],
        currentStage: stages[Math.max(currentIndex, stages.findIndex(({ id }) => id === stage.id) + 1)]?.id ?? nextStage?.id ?? stage.id,
      },
    };
    setState(nextState);
    setPhase("summary");
    setMessage(ageBand === "kids" ? "You kept going and finished the round. Great effort!" : "Stage complete.");
    saveAdaptiveState(nextState).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not save lesson progress.");
    });
  }, [ageBand, currentIndex, phase, run, stage, state]);

  if (phase && stage) {
    const checkpoint = run && phase === "summary" ? getLessonCheckpoint(run) : null;
    return (
      <section aria-labelledby="lesson-heading" className="learn-lesson">
        <div className="learn-heading">
          <div>
            <span className="eyebrow">Learn · {ageBand === "kids" ? "Kids" : "Standard"}</span>
            <h1 id="lesson-heading">{stage.title}</h1>
          </div>
          <Button onClick={() => { setPhase(null); setStageId(""); setRun(null); }} variant="secondary">Lesson path</Button>
        </div>
        {phase === "intro" && (
          <div className="lesson-panel">
            <p>Use the highlighted fingers and let the speed come later.</p>
            <HandMap highlightedCodes={stage.keys} pack={pack} />
            <Button onClick={() => {
              try {
                const target = stage.id === "space"
                  ? createWordPracticeTarget(pack, stage.keys, ageBand, 30, nextLessonSeed())
                  : stageTarget(stage, stage.id === "capitals");
                setRun(createLessonRun(target, ageBand));
                setPhase("guided");
                setError("");
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Could not create the lesson drill.");
              }
            }}>Begin guided drill</Button>
          </div>
        )}
        {(phase === "guided" || phase === "word-practice" || phase === "checkpoint") && run && (
          <div className="lesson-panel">
            <p>{phase === "guided" ? "Guided drill" : phase === "word-practice" ? "Word practice" : "Checkpoint"} · {run.cursor} / {run.target.length}</p>
            {stage.id === "capitals" && <p>Hold Shift while typing the highlighted letter.</p>}
            {stage.id === "marks" && <p>Hold Shift for the question mark.</p>}
            <div
              aria-hidden="true"
              className="typing-text typing-text--practice"
              data-current-index={run.cursor}
              data-commit-index={run.cursor}
              data-commit-sequence="0"
              ref={typingDisplayRef}
            >
              {run.target.map((character, index) => (
                <TypingCharacter
                  character={character}
                  index={index}
                  key={index}
                  state={index < run.cursor ? "correct" : index === run.cursor ? "current" : "untyped"}
                />
              ))}
            </div>
            <KeyboardMap
              nextCode={nextCode}
              nextShift={stage.id === "capitals" || (stage.id === "marks" && currentCharacter === "?")}
              pack={pack}
            />
            {message && <p className="practice-error" role="status">{message}</p>}
            <TypingCapture
              allowBackspace={false}
              inputLabel="Type the highlighted key"
              onBackspace={() => {}}
              onCharacter={(character, _code, timestamp) => submitCharacter(character, timestamp)}
              onPause={() => setLessonPaused(true)}
              paused={lessonPaused}
            />
            <Button onClick={() => setLessonPaused((paused) => !paused)} variant="secondary">
              {lessonPaused ? "Resume lesson" : "Pause lesson"}
            </Button>
          </div>
        )}
        {phase === "summary" && (
          <div className="lesson-panel" role="status">
            <h2>{checkpoint?.passed ? "Checkpoint passed" : "Another round is ready"}</h2>
            {checkpoint && <p>Accuracy {Math.round(checkpoint.accuracy)}% · target {checkpoint.threshold}%</p>}
            {message && <p>{message}</p>}
            {!checkpoint?.passed && run && (
              <Button onClick={() => {
                setRun(startAnotherLessonRound(run));
                setPhase("checkpoint");
                setMessage("");
              }}>Try another round</Button>
            )}
            {checkpoint?.passed && <Button onClick={() => { setPhase(null); setStageId(""); setRun(null); }}>Continue along the path</Button>}
          </div>
        )}
        {error && <p className="history-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-labelledby="learn-heading" className="learn-path">
      <div className="learn-heading">
        <div><span className="eyebrow">Learn</span><h1 id="learn-heading">Your keyboard path</h1></div>
        <Link className="text-link" href="/practice/">Go to Practice</Link>
      </div>
      <ol className="stage-list">
        {stages.map((item, index) => {
          const complete = state.learnProgress.completedStages.includes(item.id);
          const current = index === currentIndex;
          const locked = index > currentIndex;
          const unlockRequirement = stages[index - 1]?.title ?? stages[currentIndex]?.title ?? "the previous stage";
          return (
            <li className={`stage-item ${complete ? "stage-item--complete" : ""}`} key={item.id}>
              <span aria-hidden="true" className="stage-marker">{index + 1}</span>
              <div><h2>{item.title}</h2><p>{item.keys.map((code) => item.id === "marks" && code === "Slash" ? pack.keyMap[code].shifted : pack.keyMap[code].label).join(" · ")}</p></div>
              <span className="stage-state">
                {complete ? "Completed" : current ? "Current" : `Locked · Finish ${unlockRequirement} first`}
              </span>
              {!locked && (
                <Button onClick={() => startStage(item)} variant={current ? "primary" : "secondary"}>
                  {complete ? "Review" : "Start lesson"}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="physical-note">Learn uses the English keyboard map. A physical keyboard is needed for drills.</p>
      {error && <p className="history-error" role="alert">{error}</p>}
    </section>
  );
}
