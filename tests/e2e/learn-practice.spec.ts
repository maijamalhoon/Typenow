import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, results.violations.map(({ id, help }) => `${id}: ${help}`).join("\n")).toEqual([]);
}

test("finishes the home-row lesson, unlocks the next stage, and records Practice keys", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your keyboard path" })).toBeVisible();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(page.getByRole("heading", { name: "Home row" })).toBeVisible();
  await page.getByRole("button", { name: "Begin guided drill" }).click();

  let guidedTarget = "";
  for (const phase of ["Guided drill", "Word practice", "Checkpoint"]) {
    await expect(page.getByText(new RegExp(`${phase} ·`))).toBeVisible();
    const target = (await page.locator(".typing-character").allTextContents())
      .map((character) => character.replaceAll("\u00a0", " "))
      .join("");
    if (phase === "Guided drill") guidedTarget = target;
    if (phase === "Checkpoint") {
      expect(target.length).toBeGreaterThanOrEqual(60);
      expect(target).not.toBe(guidedTarget);
    }
    await page.getByLabel("Type the highlighted key").pressSequentially(target);
  }

  await expect(page.getByRole("heading", { name: "Checkpoint passed" })).toBeVisible();
  await page.getByRole("button", { name: "Continue along the path" }).click();
  await expect(page.getByRole("button", { name: "Review" })).toBeVisible();
  await expect(page.getByText("Locked · Finish Top row first")).toBeVisible();

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
  await expect(page.getByRole("radio", { name: "Kids" })).toHaveCount(0);
  await page.goto("/practice/");
  await expect(page.getByText(/Target \d+ WPM/)).toBeVisible();
  await expectAccessible(page);
});

test("charges a Practice mistake to the intended key and persists only at pause", async ({ page }) => {
  await page.goto("/practice/");
  const text = page.locator(".typing-text--practice");
  const input = page.getByLabel("Type the highlighted key");
  await expect(input).toBeFocused();
  const firstExpected = (await text.locator(".typing-character--current").textContent())?.replace("\u00a0", " ") ?? "";
  const firstTwo = await text.locator(".typing-character").evaluateAll((items) =>
    items.slice(0, 2).map((item) => item.textContent === "\u00a0" ? " " : item.textContent ?? ""),
  );
  const wrong = "fjdkslagh".split("").find((character) => !firstTwo.includes(character));
  if (!wrong || wrong === firstExpected) throw new Error("Could not choose an unrelated home-row key for the regression test.");
  await page.keyboard.press(wrong);
  await page.keyboard.press(firstExpected === " " ? "Space" : firstExpected);
  await page.getByRole("button", { name: "Pause practice" }).click();

  const stats = await page.evaluate(async () => {
    const request = indexedDB.open("type-now:history");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("key-stats", "readonly");
    const all = await new Promise<Array<{ keyCode: string; attempts: number; errors: number; smoothedTimeMs: number | null }>>((resolve, reject) => {
      const get = transaction.objectStore("key-stats").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return all;
  });
  const expectedCode = `Key${firstExpected.toUpperCase()}`;
  const wrongCode = `Key${wrong.toUpperCase()}`;
  expect(stats.find(({ keyCode }) => keyCode === expectedCode)).toMatchObject({
    attempts: 2,
    errors: 1,
    smoothedTimeMs: null,
  });
  expect(stats.find(({ keyCode }) => keyCode === wrongCode)).toBeUndefined();
});
