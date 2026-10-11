import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, results.violations.map(({ id, help }) => `${id}: ${help}`).join("\n")).toEqual([]);
}

test("finishes the home-row lesson, unlocks the next stage, and records Practice keys", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Standard" }).check();
  await page.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your keyboard path" })).toBeVisible();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(page.getByRole("heading", { name: "Home row" })).toBeVisible();
  await page.getByRole("button", { name: "Begin guided drill" }).click();

  for (const phase of ["Guided drill", "Word practice", "Checkpoint"]) {
    await expect(page.getByText(new RegExp(`${phase} ·`))).toBeVisible();
    const target = (await page.locator(".typing-character").allTextContents())
      .map((character) => character.replaceAll("\u00a0", " "))
      .join("");
    await page.getByLabel("Type the highlighted key").pressSequentially(target);
  }

  await expect(page.getByRole("heading", { name: "Checkpoint passed" })).toBeVisible();
  await page.getByRole("button", { name: "Continue along the path" }).click();
  await expect(page.getByRole("button", { name: "Review" })).toBeVisible();
  await expect(page.getByText("Locked", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Go to Practice" }).click();
  await expect(page.getByLabel("Type the highlighted key")).toBeFocused();
  const typingText = page.locator(".typing-text--practice");
  await expect(typingText).toBeVisible();
  const first = (await typingText.locator(".typing-character--current").textContent())?.replace("\u00a0", " ") ?? "";
  await page.keyboard.press(first === "a" ? "b" : "a");
  await expect(page.locator(".practice-wrong-key")).toBeVisible();
  await expect(typingText.locator(".typing-character--current")).toHaveCount(1);
  const currentBeforeBackspace = await typingText.locator(".typing-character--current").textContent();
  await page.keyboard.press("Backspace");
  await expect(typingText.locator(".typing-character--current")).toHaveText(currentBeforeBackspace ?? "");
  await page.keyboard.press(first === " " ? "Space" : first);
  await expect(typingText.locator(".typing-character--correct")).toHaveCount(1);
  await expect(page.locator(".practice-wrong-key")).toHaveCount(0);
  await page.getByRole("button", { name: "Pause practice" }).click();
  await expect(page.getByLabel("Type the highlighted key")).toBeDisabled();
  await page.getByRole("button", { name: "Resume practice" }).click();
  await expect(page.getByLabel("Type the highlighted key")).toBeFocused();
});

test("checks accessibility on Learn, lesson, Practice in both age bands, and key progress", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);

  await page.getByRole("link", { name: "Learn", exact: true }).click();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Begin guided drill" }).click();
  await expectAccessible(page);
  const target = (await page.locator(".typing-character").allTextContents())
    .map((character) => character.replaceAll("\u00a0", " "))
    .join("");
  await page.getByLabel("Type the highlighted key").pressSequentially(target);
  await expect(page.getByText(/Word practice ·/)).toBeVisible();
  const wordPracticeTarget = (await page.locator(".typing-character").allTextContents())
    .map((character) => character.replaceAll("\u00a0", " "))
    .join("");
  await expect(page.getByText(/Word practice ·/)).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Type the highlighted key").pressSequentially(wordPracticeTarget);
  await expect(page.getByText(/Checkpoint ·/)).toBeVisible();
  const checkpointTarget = (await page.locator(".typing-character").allTextContents())
    .map((character) => character.replaceAll("\u00a0", " "))
    .join("");
  await expectAccessible(page);
  await page.getByLabel("Type the highlighted key").pressSequentially(checkpointTarget);
  await expectAccessible(page);

  await page.goto("/practice/");
  await expect(page.getByLabel("Type the highlighted key")).toBeFocused();
  await expectAccessible(page);
  await page.goto("/progress/");
  await expect(page.getByRole("heading", { name: "Per-key progress" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/");
  await page.getByRole("radio", { name: "Kids" }).check();
  await page.goto("/practice/");
  await expect(page.getByText(/Accuracy/)).toBeVisible();
  await expect(page.getByText(/Target \d+ WPM/)).toHaveCount(0);
  await expect(page.getByLabel("Target speed")).toHaveCount(0);
  await expectAccessible(page);
});
