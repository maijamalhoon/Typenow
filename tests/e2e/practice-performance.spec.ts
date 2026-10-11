import { expect, test, type Page } from "@playwright/test";

const SAMPLE_COUNT = 224;

interface LatencySamples {
  readonly commit: number[];
  readonly nextFrame: number[];
}

async function collectTypingLatency(
  page: Page,
  selector: ".typing-text--practice",
  count: number,
  restartCompletedRounds: boolean,
): Promise<LatencySamples> {
  return page.evaluate(async ({ selector, count, restartCompletedRounds }) => {
    const input = document.querySelector<HTMLInputElement>("#typing-capture-input");
    if (!input) throw new Error("The hidden typing input is unavailable.");
    const commit: number[] = [];
    const nextFrame: number[] = [];
    const waitFor = async (predicate: () => boolean, message: string): Promise<number> => {
      const deadline = performance.now() + 10_000;
      while (!predicate()) {
        if (performance.now() > deadline) throw new Error(message);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return performance.now();
    };

    for (let stroke = 0; stroke < count; stroke += 1) {
      let display = document.querySelector<HTMLElement>(selector);
      if (!display) throw new Error(`Typing display ${selector} is unavailable.`);
      let current = display.querySelector<HTMLElement>(".typing-character--current");
      if (!current && restartCompletedRounds) {
        const anotherRound = Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent?.trim() === "Another round");
        if (!anotherRound) throw new Error("Practice round ended without an Another round action.");
        const oldTarget = display.textContent;
        anotherRound.click();
        await waitFor(() => {
          display = document.querySelector<HTMLElement>(selector);
          current = display?.querySelector<HTMLElement>(".typing-character--current") ?? null;
          return Boolean(current && display?.textContent !== oldTarget);
        }, "The next Practice round did not load.");
      }
      const resume = Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Resume practice");
      if (resume) {
        resume.click();
        await waitFor(() => !input.disabled, "Practice did not resume.");
      }
      input.focus();
      if (input.disabled) throw new Error("The Practice input is unexpectedly disabled.");
      display = document.querySelector<HTMLElement>(selector);
      current = display?.querySelector<HTMLElement>(".typing-character--current") ?? null;
      if (!display || !current) throw new Error("The next expected character is unavailable.");
      const character = current.textContent === "\u00a0" ? " " : current.textContent ?? "";
      if (character.length !== 1) throw new Error("Expected one character at the typing cursor.");
      const beforeSequence = Number(display.dataset.commitSequence ?? "0");
      const code = character === " " ? "Space" : `Key${character.toUpperCase()}`;
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code, key: character }));
      input.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: character,
        inputType: "insertText",
      }));
      const nextFrameAt = await waitFor(
        () => {
          const currentDisplay = document.querySelector<HTMLElement>(selector);
          return Number(currentDisplay?.dataset.commitSequence ?? "0") > beforeSequence;
        },
        `DOM did not commit Practice/Learn keystroke ${stroke + 1}.`,
      );
      const committedDisplay = document.querySelector<HTMLElement>(selector);
      if (!committedDisplay) throw new Error("Typing display was removed before the commit was measured.");
      commit.push(Number(committedDisplay.dataset.lastCommitMs));
      const keypressTimestamp = Number(committedDisplay.dataset.keypressTimestamp);
      nextFrame.push(nextFrameAt - keypressTimestamp);
    }
    return { commit, nextFrame };
  }, { selector, count, restartCompletedRounds });
}

function summarize(samples: readonly number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    median: sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted[sorted.length - 1],
  };
}

function report(screen: string, regular: LatencySamples, throttled: LatencySamples) {
  const regularCommit = summarize(regular.commit);
  const regularFrame = summarize(regular.nextFrame);
  const throttledCommit = summarize(throttled.commit);
  const throttledFrame = summarize(throttled.nextFrame);
  console.log(
    `${screen} (keypress-to-DOM-commit, ${SAMPLE_COUNT} keys): ` +
    `unthrottled median=${regularCommit.median.toFixed(2)} ms p95=${regularCommit.p95.toFixed(2)} ms max=${regularCommit.max.toFixed(2)} ms; ` +
    `4x CPU median=${throttledCommit.median.toFixed(2)} ms p95=${throttledCommit.p95.toFixed(2)} ms max=${throttledCommit.max.toFixed(2)} ms`,
  );
  console.log(
    `${screen} (keypress-to-next-frame proxy): ` +
    `unthrottled median=${regularFrame.median.toFixed(2)} ms p95=${regularFrame.p95.toFixed(2)} ms max=${regularFrame.max.toFixed(2)} ms; ` +
    `4x CPU median=${throttledFrame.median.toFixed(2)} ms p95=${throttledFrame.p95.toFixed(2)} ms max=${throttledFrame.max.toFixed(2)} ms`,
  );
  expect(regular.commit).toHaveLength(SAMPLE_COUNT);
  expect(throttled.commit).toHaveLength(SAMPLE_COUNT);
  expect(regularCommit.p95).toBeLessThan(16);
}

test("measures 224 Practice keystrokes unthrottled and at 4x CPU", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto("/practice/");
  await expect(page.getByLabel("Type the highlighted key")).toBeFocused();
  const regular = await collectTypingLatency(page, ".typing-text--practice", SAMPLE_COUNT, true);

  await page.goto("/practice/");
  await expect(page.getByLabel("Type the highlighted key")).toBeFocused();
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const throttled = await collectTypingLatency(page, ".typing-text--practice", SAMPLE_COUNT, true);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.detach();
  report("Practice", regular, throttled);
});

test("measures 224 Learn drill keystrokes unthrottled and at 4x CPU", async ({ page, context }) => {
  test.setTimeout(180_000);
  const beginDrill = async () => {
    await page.goto("/learn/?stage=home-row");
    await expect(page.getByRole("heading", { name: "Home row" })).toBeVisible();
    await page.getByRole("button", { name: "Begin guided drill" }).click();
    await expect(page.getByText(/Guided drill ·/)).toBeVisible();
  };

  await beginDrill();
  const regular = await collectTypingLatency(page, ".typing-text--practice", SAMPLE_COUNT, false);

  await beginDrill();
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const throttled = await collectTypingLatency(page, ".typing-text--practice", SAMPLE_COUNT, false);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.detach();
  report("Learn drill", regular, throttled);
});
