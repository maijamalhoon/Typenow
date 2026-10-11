import { createSeededRandom, type AdaptiveAgeBand } from "@typenow/engine";
import type { LanguagePack } from "@typenow/language-packs";

export function createWordPracticeTarget(
  pack: LanguagePack,
  stageKeys: readonly string[],
  ageBand: AdaptiveAgeBand,
  count: number,
  seed: string,
): string {
  if (stageKeys.length === 0) throw new RangeError("A lesson stage must include at least one key.");
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Word count must be a positive integer.");
  const stageEnd = pack.unlockOrder.indexOf(stageKeys[stageKeys.length - 1]);
  if (stageEnd < 0) throw new RangeError("The lesson stage key is not present in the language-pack unlock order.");
  const availableLetters = new Set<string>(
    pack.unlockOrder
      .slice(0, stageEnd + 1)
      .map((code) => pack.keyMap[code].unshifted)
      .filter((character) => /^[a-z]$/.test(character)),
  );
  const sourceWords = ageBand === "kids" ? pack.kidsWords : pack.commonWords;
  const candidates = sourceWords.filter(
    (word) => word.length >= 2 && Array.from(word).every((letter) => availableLetters.has(letter)),
  );
  if (candidates.length === 0) throw new Error("No approved words are available for this lesson stage.");

  const random = createSeededRandom(seed);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return Array.from({ length: count }, (_, index) => shuffled[index % shuffled.length]).join(" ");
}
