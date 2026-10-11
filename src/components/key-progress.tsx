"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { englishPack } from "@typenow/language-packs";
import { getKeyErrorRate, getKeyTimeBudgetMs, getUnlockedKeys } from "@typenow/engine";
import { DEFAULT_ADAPTIVE_STATE, readAdaptiveState, type AdaptiveState } from "@/lib/history";
import { Heatmap } from "./keyboard-visuals";

export function KeyProgress() {
  const [state, setState] = useState<AdaptiveState>(DEFAULT_ADAPTIVE_STATE);
  const [error, setError] = useState("");
  useEffect(() => {
    readAdaptiveState().then(setState).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load key progress.");
    });
  }, []);

  const unlocked = getUnlockedKeys(englishPack, state.keyStats, state.settings.targetWpm);
  const budget = getKeyTimeBudgetMs(state.settings.targetWpm);
  const errors = Object.fromEntries(Object.entries(state.keyStats).map(([code, stats]) => [code, stats.errors]));

  return (
    <section aria-labelledby="progress-heading" className="learn-path">
      <div className="learn-heading">
        <div><span className="eyebrow">Progress</span><h1 id="progress-heading">Per-key progress</h1></div>
        <Link className="text-link" href="/learn/">Learn path</Link>
      </div>
      <p className="progress-description">
        The number on each key is its recorded error count. The single-hue scale shows lower to higher counts.
      </p>
      <div className="progress-keyboard"><Heatmap pack={englishPack} values={errors} /></div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead><tr><th scope="col">Key</th><th scope="col">Status</th><th scope="col">Samples</th><th scope="col">Accuracy</th><th scope="col">Typical time</th></tr></thead>
          <tbody>
            {englishPack.unlockOrder.map((code) => {
              const stats = state.keyStats[code];
              const accurate = stats ? Math.round((1 - getKeyErrorRate(stats)) * 100) : 0;
              return (
                <tr key={code}>
                  <th scope="row">{englishPack.keyMap[code].label}</th>
                  <td>{unlocked.includes(code) ? "Unlocked" : "Locked"}</td>
                  <td>{stats?.attempts ?? 0}</td>
                  <td>{stats ? `${accurate}%` : "—"}</td>
                  <td>{stats?.smoothedTimeMs == null ? "—" : `${Math.round(stats.smoothedTimeMs)} ms / ${Math.round(budget)} ms target`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="history-error" role="alert">{error}</p>}
    </section>
  );
}
