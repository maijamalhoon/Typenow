"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { englishPack } from "@typenow/language-packs";
import {
  getKeyErrorRate,
  getKeyProgressStatus,
  getKeyTimeBudgetMs,
} from "@typenow/engine";
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

  const budget = getKeyTimeBudgetMs(state.settings.targetWpm);
  const errorRates = Object.fromEntries(
    Object.entries(state.keyStats).map(([code, stats]) => [code, getKeyErrorRate(stats)]),
  );
  const now = Date.now();

  return (
    <section aria-labelledby="progress-heading" className="learn-path">
      <div className="learn-heading">
        <div><span className="eyebrow">Progress</span><h1 id="progress-heading">Per-key progress</h1></div>
        <Link className="text-link" href="/learn/">Learn path</Link>
      </div>
      <p className="progress-description">
        Each key shows its error rate. The single-hue scale shows lower to higher rates.
      </p>
      <div className="progress-keyboard"><Heatmap pack={englishPack} valueFormat="percent" values={errorRates} /></div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead><tr><th scope="col">Key</th><th scope="col">Status</th><th scope="col">Samples</th><th scope="col">Error rate</th><th scope="col">Typical time</th></tr></thead>
          <tbody>
            {englishPack.unlockOrder.map((code) => {
              const stats = state.keyStats[code];
              const status = getKeyProgressStatus(stats, state.settings.targetWpm, now);
              return (
                <tr key={code}>
                  <th scope="row">{englishPack.keyMap[code].label}</th>
                  <td>{status === "needs review" ? "Needs review" : status[0].toUpperCase() + status.slice(1)}</td>
                  <td>{stats?.attempts ?? 0}</td>
                  <td>{stats ? `${Math.round(getKeyErrorRate(stats) * 100)}%` : "—"}</td>
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
