"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KIDS_MODE_ENABLED } from "@typenow/language-packs";
import { getDefaultTargetWpm } from "@typenow/engine";
import {
  DEFAULT_ADAPTIVE_STATE,
  readAdaptiveState,
  readTestHistory,
  saveAdaptiveState,
  type AdaptiveState,
} from "@/lib/history";
import { STORAGE_KEYS } from "@/lib/brand";
import { Button } from "./ui";

interface HomeStatus {
  readonly hasProgress: boolean;
  readonly state: AdaptiveState;
}

export function HomeStart() {
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [ageBand, setAgeBand] = useState<"standard" | "kids">("standard");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([readAdaptiveState(), readTestHistory()]).then(([state, records]) => {
      if (!active) return;
      const savedAgeBand = window.localStorage.getItem(STORAGE_KEYS.ageBand);
      const selected = KIDS_MODE_ENABLED && savedAgeBand === "kids" ? "kids" : "standard";
      setAgeBand(selected);
      setStatus({
        state,
        hasProgress:
          records.length > 0 ||
          state.learnProgress.completedStages.length > 0 ||
          Object.keys(state.keyStats).length > 0,
      });
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load local progress.");
    });
    return () => {
      active = false;
    };
  }, []);

  const hasProgress = status?.hasProgress ?? false;
  const state = status?.state ?? DEFAULT_ADAPTIVE_STATE;
  const allLearnStagesComplete = state.learnProgress.completedStages.includes("marks");
  const continueHref = allLearnStagesComplete
    ? "/practice/"
    : `/learn/?stage=${encodeURIComponent(state.learnProgress.currentStage || "home-row")}`;
  const actionHref = hasProgress ? continueHref : "/learn/?stage=home-row";

  return (
    <div className="home-start">
      {KIDS_MODE_ENABLED && (
        <fieldset className="age-choice">
          <legend>Typing mode</legend>
          <div className="segmented-control">
            {(["standard", "kids"] as const).map((band) => (
              <label key={band}>
                <input
                  checked={ageBand === band}
                  name="age-band"
                  onChange={() => updateAgeBand(band)}
                  type="radio"
                  value={band}
                />
                <span>{band === "kids" ? "Kids" : "Standard"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Button
        className="home-start__button"
        disabled={!status}
        onClick={() => {
          window.location.href = actionHref;
        }}
      >
        {hasProgress ? "Continue" : "Start learning"}
      </Button>
      <p className="home-action-detail">
        {hasProgress
          ? allLearnStagesComplete
            ? "Adaptive Practice"
            : `Learn · ${state.learnProgress.currentStage.replaceAll("-", " ")}`
          : "Learn · Home row"}
      </p>
      {!hasProgress && (
        <Link className="text-link" href="/test/?start=1">Check my speed · 30-second test</Link>
      )}
      <Link className="text-link" href="/history/">Test history and backups</Link>
      {error && <p className="history-error" role="alert">{error}</p>}
    </div>
  );

  function updateAgeBand(nextAgeBand: "standard" | "kids") {
    if (!KIDS_MODE_ENABLED && nextAgeBand === "kids") return;
    setAgeBand(nextAgeBand);
    try {
      window.localStorage.setItem(STORAGE_KEYS.ageBand, nextAgeBand);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save typing mode on this device.");
      return;
    }
    readAdaptiveState()
      .then((current) => saveAdaptiveState({
        ...current,
        settings: {
          ...current.settings,
          ageBand: nextAgeBand,
          targetWpm: getDefaultTargetWpm(nextAgeBand),
        },
      }))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not save typing mode."));
  }
}
