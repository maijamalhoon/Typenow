"use client";

import { useEffect, useState } from "react";
import { contrastRatio } from "@typenow/engine";
import { englishPack } from "@typenow/language-packs/en";
import { HandMap, Heatmap, KeyboardMap } from "./keyboard-visuals";
import { Button, Keycap, Surface } from "./ui";

const paletteTokens = [
  ["Canvas", "--color-canvas", ""],
  ["Surface", "--color-surface", ""],
  ["Primary text", "--color-text", "text"],
  ["Secondary text", "--color-text-muted", "muted"],
  ["Boundary", "--color-border", "boundary"],
  ["Accent", "--color-accent", "accent"],
  ["Text on accent", "--color-on-accent", "onAccent"],
  ["Error", "--color-error", "error"],
  ["Untyped text", "--color-typing-untyped", "untyped"],
  ["Correct text", "--color-typing-correct", "correct"],
  ["Error text", "--color-typing-error", "typingError"],
  ["Current-character block", "--color-current", "currentBlock"],
  ["Current-character text", "--color-on-accent", "current"],
  ["Focus ring", "--color-focus", "focus"],
  ...[1, 2, 3, 4, 5, 6].map(
    (step) => [`Heatmap step ${step}`, `--heat-${step}`, `heat${step}`] as const,
  ),
] as const;

function contrast(foreground: string, background: string): string {
  return `${contrastRatio(foreground, background).toFixed(2)}:1`;
}

function ThemePanel({ theme }: { theme: "light" | "dark" }) {
  const [ratios, setRatios] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-theme="${theme}"]`);
    if (!root) throw new Error(`Missing ${theme} theme panel.`);
    const style = getComputedStyle(root);
    const read = (name: string) => style.getPropertyValue(name).trim();
    setRatios({
      text: contrast(read("--color-text"), read("--color-canvas")),
      muted: contrast(read("--color-text-muted"), read("--color-canvas")),
      boundary: `${contrast(read("--color-border"), read("--color-canvas"))} canvas / ${contrast(read("--color-border"), read("--color-surface"))} surface`,
      accent: contrast(read("--color-accent"), read("--color-canvas")),
      onAccent: contrast(read("--color-on-accent"), read("--color-accent")),
      error: contrast(read("--color-error"), read("--color-canvas")),
      untyped: contrast(read("--color-typing-untyped"), read("--color-canvas")),
      correct: contrast(read("--color-typing-correct"), read("--color-canvas")),
      typingError: contrast(read("--color-typing-error"), read("--color-canvas")),
      currentBlock: contrast(read("--color-current"), read("--color-canvas")),
      current: contrast(read("--color-on-accent"), read("--color-current")),
      focus: `${contrast(read("--color-focus"), read("--color-canvas"))} canvas / ${contrast(read("--color-focus"), read("--color-surface"))} surface`,
      ...[1, 2, 3, 4, 5, 6].reduce<Record<string, string>>((steps, step) => {
        steps[`heat${step}`] = contrast(read(`--heat-foreground-${step}`), read(`--heat-${step}`));
        return steps;
      }, {}),
    });
  }, [theme]);

  return (
    <article className="theme-panel" data-theme={theme}>
      <header className="theme-panel__header">
        <div>
          <span className="eyebrow">Theme</span>
          <h2>{theme === "light" ? "Daylight" : "After hours"}</h2>
        </div>
        <span className="theme-label">{theme}</span>
      </header>
      <Surface className="token-section">
        <h3>Color tokens</h3>
        <div className="token-list">
          {paletteTokens.map(([label, variable, ratioKey]) => (
            <div className="token-row" key={label}>
              <span aria-hidden="true" className="token-swatch" style={{ backgroundColor: `var(${variable})` }} />
              <span className="token-name">{label}</span>
              <span className="token-ratio">{ratioKey ? ratios[ratioKey] ?? "Calculating…" : "—"}</span>
            </div>
          ))}
        </div>
      </Surface>
      <Surface className="kit-section">
        <h3>Components</h3>
        <div className="component-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
        </div>
        <div className="component-row">
          <Keycap>A</Keycap><Keycap className="keycap--next">F</Keycap>
          <span className="text-sample text-sample--error">underlined error</span>
        </div>
        <div className="type-specimen">
          <span className="eyebrow">Type scale</span>
          <div className="type-scale">
            {[14, 16, 20, 24, 32, 48, 64].map((size) => (
              <span key={size} style={{ fontSize: `var(--font-size-${size})` }}>{size} · Aa</span>
            ))}
          </div>
          <p className="type-specimen__body">Default typing · Source Sans 3 · Standard 32 px / Kids 48 px</p>
          <p className="type-specimen__typing">A steady practice</p>
          <span className="type-specimen__kids">Atkinson Hyperlegible · optional legibility option</span>
        </div>
        <div className="elevation-sample">Single shadow level</div>
      </Surface>
      <Surface className="kit-section">
        <h3>Spacing scale · 8 px grid</h3>
        <div className="spacing-scale">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((step) => (
            <div className="spacing-step" key={step}>
              <span>{step * 8} px</span>
              <span className="spacing-block" style={{ inlineSize: `var(--space-${step})` }} />
            </div>
          ))}
        </div>
        <p className="section-note">One 8 px radius · one shadow level · focus ring shown on keyboard focus.</p>
      </Surface>
      <Surface className="kit-section">
        <h3>Language-pack visuals</h3>
        <p className="section-note">Key positions and finger groupings come from the English pack data.</p>
        <KeyboardMap pack={englishPack} nextCode="KeyF" />
        <HandMap pack={englishPack} />
      </Surface>
      <Surface className="kit-section">
        <h3>Heatmap component specimen</h3>
        <p className="section-note">Light: low → dark. Dark: dark → luminous. Each key shows a value with at least 4.5:1 contrast.</p>
        <p className="section-note">Illustrative ramp values only; this is not learner data.</p>
        <Heatmap pack={englishPack} values={{ KeyF: 4, KeyJ: 2, KeyD: 1, KeyK: 3, KeyS: 5, KeyL: 6 }} />
        <div aria-label={`${theme} heatmap ramp from low to high`} className="heatmap-legend">
          <span>Less</span>
          {Array.from({ length: 7 }, (_, index) => (
            <span className={`heatmap-chip heatmap-chip--${index}`} key={index} />
          ))}
          <span>More</span>
        </div>
      </Surface>
    </article>
  );
}

export function ThemeShowcase() {
  return (
    <div className="theme-grid">
      <ThemePanel theme="light" />
      <ThemePanel theme="dark" />
    </div>
  );
}
