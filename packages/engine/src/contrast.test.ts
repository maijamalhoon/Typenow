import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

const css = readFileSync(resolve(dirname(import.meta.filename), "../../../src/app/globals.css"), "utf8");

function token(theme: "light" | "dark", name: string): string {
  const block =
    theme === "light"
      ? css.match(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/)
      : css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/);
  const value = block?.[1].match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing ${theme} design token ${name}.`);
  return value;
}

describe("design token contrast utility", () => {
  it("calculates known WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(contrastRatio("#202522", "#F6F5F1")).toBeCloseTo(14.27, 2);
    expect(contrastRatio("#F2F4F1", "#171B19")).toBeCloseTo(15.73, 2);
  });

  it("rejects malformed colors instead of returning a misleading ratio", () => {
    expect(relativeLuminance("#fff")).toBe(1);
    expect(() => relativeLuminance("#ggg")).toThrow("three- or six-digit hex color");
  });

  it.each(["light", "dark"] as const)("keeps every %s heatmap number at 4.5:1 or better", (theme) => {
    const text = token(theme, "--color-text");
    const onAccent = token(theme, "--color-on-accent");
    const heatColors = [1, 2, 3, 4, 5, 6].map((step) => token(theme, `--heat-${step}`));
    const textColors =
      theme === "light"
        ? [text, text, text, text, "#ffffff", "#ffffff"]
        : [text, text, text, onAccent, onAccent, onAccent];

    for (const [index, background] of heatColors.entries()) {
      expect(contrastRatio(textColors[index], background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["light", "dark"] as const)("keeps %s text and focus tokens accessible", (theme) => {
    const canvas = token(theme, "--color-canvas");
    const surface = token(theme, "--color-surface");
    for (const name of [
      "--color-text",
      "--color-text-muted",
      "--color-typing-untyped",
      "--color-typing-correct",
      "--color-typing-error",
      "--color-error",
      "--color-accent",
    ]) {
      expect(contrastRatio(token(theme, name), canvas)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(token(theme, "--color-on-accent"), token(theme, "--color-accent"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token(theme, "--color-on-accent"), token(theme, "--color-current"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token(theme, "--color-focus"), canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token(theme, "--color-focus"), surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token(theme, "--color-border"), canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token(theme, "--color-border"), surface)).toBeGreaterThanOrEqual(3);
  });
});
