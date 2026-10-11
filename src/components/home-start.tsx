"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STORAGE_KEYS } from "@/lib/brand";
import { readAdaptiveState, saveAdaptiveState } from "@/lib/history";
import { getDefaultTargetWpm } from "@typenow/engine";
import { Button } from "./ui";

export function HomeStart() {
  const [ageBand, setAgeBand] = useState<"standard" | "kids">("standard");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const savedAgeBand = window.localStorage.getItem(STORAGE_KEYS.ageBand);
    readAdaptiveState().then((state) => {
      if (!active) return;
      const selected = savedAgeBand === "standard" || savedAgeBand === "kids"
        ? savedAgeBand
        : state.settings.ageBand;
      setAgeBand(selected);
      if (!savedAgeBand) window.localStorage.setItem(STORAGE_KEYS.ageBand, selected);
      if (selected !== state.settings.ageBand) {
        return saveAdaptiveState({
          ...state,
          settings: { ...state.settings, ageBand: selected, targetWpm: getDefaultTargetWpm(selected) },
        });
      }
      return undefined;
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load typing mode.");
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="home-start">
      <fieldset className="age-choice">
        <legend>Typing mode</legend>
        <div className="segmented-control">
          <label>
            <input
              checked={ageBand === "standard"}
              name="age-band"
              onChange={() => updateAgeBand("standard")}
              type="radio"
              value="standard"
            />
            <span>Standard</span>
          </label>
          <label>
            <input
              checked={ageBand === "kids"}
              name="age-band"
              onChange={() => updateAgeBand("kids")}
              type="radio"
              value="kids"
            />
            <span>Kids</span>
          </label>
        </div>
      </fieldset>
      <Button
        className="home-start__button"
        onClick={() => {
          window.location.href = "/practice/";
        }}
      >
        Start typing
      </Button>
      <Link className="text-link" href="/history/">Test history and backups</Link>
      <div className="home-links">
        <Link className="text-link" href="/learn/">Learn</Link>
        <Link className="text-link" href="/progress/">Progress</Link>
      </div>
      <p className="physical-note">A physical keyboard is needed to type.</p>
      {error && <p className="history-error" role="alert">{error}</p>}
    </div>
  );

  function updateAgeBand(nextAgeBand: "standard" | "kids") {
    setAgeBand(nextAgeBand);
    try {
      window.localStorage.setItem(STORAGE_KEYS.ageBand, nextAgeBand);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save typing mode on this device.");
      return;
    }
    readAdaptiveState()
      .then((state) => saveAdaptiveState({
        ...state,
        settings: {
          ...state.settings,
          ageBand: nextAgeBand,
          targetWpm: getDefaultTargetWpm(nextAgeBand),
        },
      }))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not save typing mode."));
  }
}
