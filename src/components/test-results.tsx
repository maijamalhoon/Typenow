"use client";

import type { TestMetrics } from "@typenow/engine";
import type { TestRun } from "@typenow/engine";
import Link from "next/link";
import { englishPack } from "@typenow/language-packs";
import { Heatmap } from "./keyboard-visuals";
import { Button } from "./ui";

export interface SpeedSample {
  readonly elapsedMs: number;
  readonly rawWpm: number;
}

export type TestHistorySaveStatus =
  | { readonly status: "saving" }
  | { readonly status: "saved" }
  | { readonly status: "not-saved" }
  | { readonly status: "error"; readonly message: string };

interface TestResultsProps {
  readonly durationMs: number;
  readonly historySave: TestHistorySaveStatus;
  readonly metrics: TestMetrics;
  readonly modeLabel: string;
  readonly onAgain: () => void;
  readonly run: TestRun;
  readonly speedSamples: readonly SpeedSample[];
}

export function TestResults({
  durationMs,
  historySave,
  metrics,
  modeLabel,
  onAgain,
  run,
  speedSamples,
}: TestResultsProps) {
  const errorCounts: Record<string, number> = Object.fromEntries(
    Object.keys(englishPack.keyMap).map((code) => [code, 0]),
  );
  let unmappedErrors = 0;
  for (const stroke of run.keyStrokes) {
    if (stroke.correct) continue;
    if (stroke.code in errorCounts) errorCounts[stroke.code] += 1;
    else unmappedErrors += 1;
  }

  return (
    <section className="result-page">
      <div className="result-heading">
        <div>
          <span className="eyebrow">{modeLabel}</span>
          <h1>Test complete</h1>
        </div>
        <Button onClick={onAgain} variant="secondary">Try again</Button>
      </div>
      <dl aria-label="Test results" className="result-metrics">
        <div><dt>Net WPM</dt><dd>{metrics.netWpm.toFixed(1)}</dd></div>
        <div><dt>Raw WPM</dt><dd>{metrics.rawWpm.toFixed(1)}</dd></div>
        <div><dt>Accuracy</dt><dd>{metrics.accuracy.toFixed(1)}%</dd></div>
        <div><dt>Consistency</dt><dd>{metrics.consistency.toFixed(0)}%</dd></div>
      </dl>
      <p
        aria-live={historySave.status === "error" ? "assertive" : "polite"}
        className={historySave.status === "error" ? "history-error" : "history-message"}
        role={historySave.status === "error" ? "alert" : "status"}
      >
        {historySave.status === "saving" && "Saving this result on your device..."}
        {historySave.status === "saved" && "Result saved on this device."}
        {historySave.status === "not-saved" && "Tests shorter than 15 seconds are not saved."}
        {historySave.status === "error" && `Could not save this result: ${historySave.message}`}
      </p>
      <Link className="text-link" href="/history/">View test history and backups</Link>
      <section aria-labelledby="speed-chart-heading" className="result-section">
        <h2 id="speed-chart-heading">Speed over time</h2>
        <SpeedChart durationMs={durationMs} samples={speedSamples} />
      </section>
      <section aria-labelledby="key-errors-heading" className="result-section result-section--heatmap">
        <div>
          <h2 id="key-errors-heading">Errors by key</h2>
          <p>Numbers show incorrect attempts, including mistakes later corrected.</p>
        </div>
        <Heatmap pack={englishPack} values={errorCounts} />
        {unmappedErrors > 0 && (
          <p className="unmapped-error-count">Unmapped key errors: {unmappedErrors}</p>
        )}
      </section>
    </section>
  );
}

function SpeedChart({
  durationMs,
  samples,
}: {
  readonly durationMs: number;
  readonly samples: readonly SpeedSample[];
}) {
  const maxWpm = Math.max(1, ...samples.map(({ rawWpm }) => rawWpm));
  const duration = Math.max(1, durationMs);
  const points = samples
    .map(({ elapsedMs, rawWpm }) => {
      const x = Math.max(0, Math.min(600, (elapsedMs / duration) * 600));
      const y = 160 - (Math.max(0, rawWpm) / maxWpm) * 144;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <figure className="speed-chart">
      <svg
        aria-label={`Raw words per minute over time, ${samples.length} samples`}
        className="speed-chart__svg"
        role="img"
        viewBox="0 0 600 180"
      >
        <title>Raw typing speed over the test</title>
        <line className="speed-chart__axis" x1="0" x2="600" y1="160" y2="160" />
        <line className="speed-chart__guide" x1="0" x2="600" y1="88" y2="88" />
        {points && <polyline className="speed-chart__line" points={points} />}
        <text className="speed-chart__label" x="0" y="176">Start</text>
        <text className="speed-chart__label" textAnchor="end" x="600" y="176">Finish</text>
        <text className="speed-chart__label" x="0" y="14">{maxWpm.toFixed(0)} WPM</text>
      </svg>
      <figcaption>{samples.length} one-second-or-shorter speed samples · {Math.round(durationMs / 1_000)} s</figcaption>
    </figure>
  );
}
