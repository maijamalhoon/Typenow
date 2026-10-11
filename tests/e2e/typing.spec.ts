import { expect, test } from "@playwright/test";

test("offers Learn or a 30-second test on first visit and keeps Kids mode disabled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start learning" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check my speed · 30-second test" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Kids" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Test", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Design system" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start learning" }).click();
  await expect(page).toHaveURL(/\/learn\/\?stage=home-row$/);
  await expect(page.getByRole("heading", { name: "Home row" })).toBeVisible();
});

test("advances three Practice keys delivered within one render tick", async ({ page }) => {
  await page.goto("/practice/");
  const input = page.getByLabel("Type the highlighted key");
  const text = page.locator(".typing-text--practice");
  await expect(input).toBeFocused();
  await page.evaluate(() => {
    const capture = document.querySelector<HTMLInputElement>("#typing-capture-input");
    const display = document.querySelector<HTMLElement>(".typing-text--practice");
    if (!capture || !display) throw new Error("Practice input or text is missing.");
    const chars = Array.from(display.querySelectorAll<HTMLElement>(".typing-character")).slice(0, 3);
    for (const item of chars) {
      const character = item.textContent === "\u00a0" ? " " : item.textContent ?? "";
      const code = character === " " ? "Space" : `Key${character.toUpperCase()}`;
      capture.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code, key: character }));
      capture.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: character,
        inputType: "insertText",
      }));
    }
  });
  await expect(text).toHaveAttribute("data-current-index", "3");
  await expect(text.locator(".typing-character--current")).toHaveAttribute("data-character-index", "3");
});

test("ignores repeated and dead keys, blocks paste, and commits composed text once", async ({ page }) => {
  await page.goto("/test/?start=1");
  const input = page.getByLabel("Type the displayed text");
  const text = page.locator(".typing-text");
  await expect(text).toHaveAttribute("data-current-index", "0");

  await input.dispatchEvent("keydown", {
    bubbles: true,
    code: "KeyA",
    key: "a",
    repeat: true,
  });
  await input.dispatchEvent("keydown", { bubbles: true, code: "Quote", key: "Dead" });
  await input.dispatchEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "pasted",
    inputType: "insertFromPaste",
  });
  await expect(text).toHaveAttribute("data-current-index", "0");
  for (const key of ["Shift", "Control", "Alt", "Meta", "Escape", "Backspace"]) {
    await input.dispatchEvent("keydown", { bubbles: true, code: key, key });
  }
  await expect(text).toHaveAttribute("data-current-index", "0");
  await expect(text).toHaveAttribute("data-keystroke-count", "0");

  await input.evaluate((element: HTMLInputElement) =>
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  await input.dispatchEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "a",
    inputType: "insertCompositionText",
  });
  await input.evaluate((element: HTMLInputElement) =>
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "a" })),
  );
  await expect(text).toHaveAttribute("data-current-index", "1");
  await expect(text).toHaveAttribute("data-keystroke-count", "1");
  await input.dispatchEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "a",
    inputType: "insertFromComposition",
  });
  await expect(text).toHaveAttribute("data-current-index", "1");
  await expect(text).toHaveAttribute("data-keystroke-count", "1");

  await input.evaluate((element: HTMLInputElement) => element.blur());
  await expect(input).toBeDisabled();
});

test("offers timed and word counts and pauses a word test", async ({ page }) => {
  await page.goto("/test/");
  for (const duration of [15, 30, 60, 120]) {
    await expect(page.getByRole("button", { name: `${duration} s` })).toBeVisible();
  }
  await page.getByRole("radio", { name: "Words" }).check();
  for (const count of [25, 50, 100]) {
    await expect(page.getByRole("button", { name: `${count} words` })).toBeVisible();
  }
  await page.getByRole("button", { name: "Start test" }).click();

  const counter = page.getByTestId("test-counter");
  await expect(counter).toHaveText("0 / 25 words");
  await page.getByRole("button", { name: "Pause test" }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  const pausedCounter = await counter.textContent();
  await page.waitForTimeout(1_100);
  await expect(counter).toHaveText(pausedCounter ?? "");

  await page.getByRole("button", { name: "Resume test" }).click();
  await expect(page.getByLabel("Type the displayed text")).toBeFocused();
});

test("shows exact metrics, speed graph, and mapped key errors at completion", async ({ page }) => {
  await page.goto("/test/");
  await page.getByRole("radio", { name: "Words" }).check();
  await page.getByRole("button", { name: "Start test" }).click();

  const text = page.locator(".typing-text");
  const firstExpected = await text.locator('[data-character-index="0"]').textContent();
  const wrong = firstExpected === "a" ? "b" : "a";
  await page.keyboard.press(wrong);
  await expect(text.locator(".typing-character--error")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await page.keyboard.press(firstExpected ?? "a");

  for (let batch = 0; batch < 10 && (await page.getByTestId("typing-screen").count()) > 0; batch += 1) {
    const cursor = Number(await text.getAttribute("data-current-index"));
    const remainingText = await text.locator(".typing-character").evaluateAll(
      (characters, currentIndex) =>
        characters
          .filter((character) => Number((character as HTMLElement).dataset.characterIndex) >= currentIndex)
          .map((character) => character.textContent ?? "")
          .join("")
          .replaceAll("\u00a0", " "),
      cursor,
    );
    await page.keyboard.insertText(remainingText);
  }

  await expect(page.getByRole("heading", { name: "Test complete" })).toBeVisible();
  await expect(page.getByText("Tests shorter than 15 seconds are not saved.")).toBeVisible();
  await expect(page.getByText("Net WPM")).toBeVisible();
  await expect(page.getByText("Raw WPM")).toBeVisible();
  await expect(page.getByText("Accuracy")).toBeVisible();
  await expect(page.getByText("Consistency")).toBeVisible();
  await expect(page.getByRole("img", { name: /Raw words per minute over time/ })).toBeVisible();
  await expect(page.locator(".heat-key")).toHaveCount(34);
  await expect(page.locator(".heat-key").filter({ has: page.getByText("1", { exact: true }) })).toHaveCount(1);
  await expect(
    page.locator(`.keyboard-map .heat-key[aria-label^="${wrong.toUpperCase()}: 1 error"]`),
  ).toBeVisible();
});

test("measures 224 keystrokes at normal speed and with 4x CPU throttling", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto("/test/");
  await page.getByRole("radio", { name: "Words" }).check();
  await page.getByRole("button", { name: "100 words" }).click();
  await page.getByRole("button", { name: "Start test" }).click();
  const text = page.locator(".typing-text");
  await expect(text).toHaveAttribute("data-current-index", "0");

  async function collectKeystrokeLatencies(): Promise<{
    readonly commit: readonly number[];
    readonly nextFrame: readonly number[];
  }> {
    return page.evaluate(async (sampleCount) => {
      const typingInput = document.querySelector<HTMLInputElement>("#typing-capture-input");
      const typingText = document.querySelector<HTMLElement>(".typing-text");
      if (!typingInput || !typingText) throw new Error("Typing input or display is unavailable.");

      const commitLatencies: number[] = [];
      const nextFrameLatencies: number[] = [];
      for (let index = 0; index < sampleCount; index += 1) {
        const expectedIndex = Number(typingText.dataset.currentIndex) + 1;
        const current = typingText.querySelector<HTMLElement>(".typing-character--current");
        if (!current) throw new Error("The current typing character is unavailable.");
        const character = current.textContent === "\u00a0" ? " " : current.textContent ?? "";
        const code = character === " " ? "Space" : `Key${character.toUpperCase()}`;

        typingInput.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, code, key: character }),
        );
        typingInput.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data: character,
            inputType: "insertText",
          }),
        );

        await new Promise<void>((resolve) => {
          const waitForCommit = () => {
            if (typingText.dataset.commitIndex === String(expectedIndex)) {
              resolve();
            } else {
              requestAnimationFrame(waitForCommit);
            }
          };
          requestAnimationFrame(waitForCommit);
        });
        commitLatencies.push(Number(typingText.dataset.lastCommitMs));
        await new Promise<void>((resolve) => {
          const waitForPaint = () => {
            if (typingText.dataset.paintedIndex === String(expectedIndex)) {
              resolve();
            } else {
              requestAnimationFrame(waitForPaint);
            }
          };
          requestAnimationFrame(waitForPaint);
        });
        nextFrameLatencies.push(Number(typingText.dataset.lastPaintMs));
        const interKeystrokeDelayMs = 29 + Math.random() * 41;
        await new Promise((resolve) => window.setTimeout(resolve, interKeystrokeDelayMs));
      }
      return { commit: commitLatencies, nextFrame: nextFrameLatencies };
    }, 224);
  }

  function summarize(samples: readonly number[]) {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      median:
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      max: sorted[sorted.length - 1],
    };
  }

  const normalSamples = await collectKeystrokeLatencies();
  expect(normalSamples.commit).toHaveLength(224);
  expect(normalSamples.nextFrame).toHaveLength(224);
  const normal = {
    commit: summarize(normalSamples.commit),
    nextFrame: summarize(normalSamples.nextFrame),
  };

  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const throttledSamples = await collectKeystrokeLatencies();
  expect(throttledSamples.commit).toHaveLength(224);
  expect(throttledSamples.nextFrame).toHaveLength(224);
  const throttled = {
    commit: summarize(throttledSamples.commit),
    nextFrame: summarize(throttledSamples.nextFrame),
  };
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.detach();

  console.log(
    `keypress-to-DOM-commit (224 keys each): unthrottled median=${normal.commit.median.toFixed(2)} ms p95=${normal.commit.p95.toFixed(2)} ms max=${normal.commit.max.toFixed(2)} ms; 4x CPU median=${throttled.commit.median.toFixed(2)} ms p95=${throttled.commit.p95.toFixed(2)} ms max=${throttled.commit.max.toFixed(2)} ms`,
  );
  console.log(
    `keypress-to-next-frame proxy: unthrottled median=${normal.nextFrame.median.toFixed(2)} ms p95=${normal.nextFrame.p95.toFixed(2)} ms max=${normal.nextFrame.max.toFixed(2)} ms; 4x CPU median=${throttled.nextFrame.median.toFixed(2)} ms p95=${throttled.nextFrame.p95.toFixed(2)} ms max=${throttled.nextFrame.max.toFixed(2)} ms`,
  );
  expect(normal.commit.p95).toBeLessThan(16);
});

test("imports valid local history, rejects invalid JSON, and exports a backup", async ({ page }) => {
  await page.goto("/history/");

  const backup = {
    format: "Type now history",
    schemaVersion: 1,
    exportedAt: "2026-10-11T12:00:00.000Z",
    records: [{
      id: "e2e-history-record",
      completedAt: "2026-10-11T12:00:00.000Z",
      durationMs: 15_000,
      mode: "timed",
      modeValue: 15,
      metrics: {
        netWpm: 30,
        rawWpm: 32,
        accuracy: 95,
        consistency: 90,
        correctCharacters: 75,
        totalCharacters: 80,
        correctKeystrokes: 75,
        totalKeystrokes: 80,
      },
      keyErrors: { KeyA: 2 },
    }],
  };
  const fileInput = page.locator(".history-import input");
  await fileInput.setInputFiles({
    name: "history.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("status")).toHaveText("1 test record imported or updated.");
  await expect(page.getByRole("cell", { name: "15 seconds" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "30.0" })).toBeVisible();

  await fileInput.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.locator(".history-error")).toHaveText(
    "The selected file is not a supported Type now history backup.",
  );

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("type-now-history.json");
});
