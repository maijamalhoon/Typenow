import type { KeyDefinition, LanguagePack } from "../index";
import blocklist from "./BLOCKLIST.json";
import { kidsAllowlist } from "./kids-allowlist.generated";
import words from "./words.json";

const blockedWords = new Set<string>(blocklist);

export const KIDS_MODE_ENABLED = false;

export function filterBlockedWords(candidates: readonly string[]): string[] {
  return candidates.filter((word) => !blockedWords.has(word));
}

const filteredWords = filterBlockedWords(words);

const keyMap = {
  KeyQ: { code: "KeyQ", label: "Q", unshifted: "q", shifted: "Q", finger: "left-pinky", row: "top", column: 0 },
  KeyW: { code: "KeyW", label: "W", unshifted: "w", shifted: "W", finger: "left-ring", row: "top", column: 1 },
  KeyE: { code: "KeyE", label: "E", unshifted: "e", shifted: "E", finger: "left-middle", row: "top", column: 2 },
  KeyR: { code: "KeyR", label: "R", unshifted: "r", shifted: "R", finger: "left-index", row: "top", column: 3 },
  KeyT: { code: "KeyT", label: "T", unshifted: "t", shifted: "T", finger: "left-index", row: "top", column: 4 },
  KeyY: { code: "KeyY", label: "Y", unshifted: "y", shifted: "Y", finger: "right-index", row: "top", column: 5 },
  KeyU: { code: "KeyU", label: "U", unshifted: "u", shifted: "U", finger: "right-index", row: "top", column: 6 },
  KeyI: { code: "KeyI", label: "I", unshifted: "i", shifted: "I", finger: "right-middle", row: "top", column: 7 },
  KeyO: { code: "KeyO", label: "O", unshifted: "o", shifted: "O", finger: "right-ring", row: "top", column: 8 },
  KeyP: { code: "KeyP", label: "P", unshifted: "p", shifted: "P", finger: "right-pinky", row: "top", column: 9 },
  KeyA: { code: "KeyA", label: "A", unshifted: "a", shifted: "A", finger: "left-pinky", row: "home", column: 0 },
  KeyS: { code: "KeyS", label: "S", unshifted: "s", shifted: "S", finger: "left-ring", row: "home", column: 1 },
  KeyD: { code: "KeyD", label: "D", unshifted: "d", shifted: "D", finger: "left-middle", row: "home", column: 2 },
  KeyF: { code: "KeyF", label: "F", unshifted: "f", shifted: "F", finger: "left-index", row: "home", column: 3 },
  KeyG: { code: "KeyG", label: "G", unshifted: "g", shifted: "G", finger: "left-index", row: "home", column: 4 },
  KeyH: { code: "KeyH", label: "H", unshifted: "h", shifted: "H", finger: "right-index", row: "home", column: 5 },
  KeyJ: { code: "KeyJ", label: "J", unshifted: "j", shifted: "J", finger: "right-index", row: "home", column: 6 },
  KeyK: { code: "KeyK", label: "K", unshifted: "k", shifted: "K", finger: "right-middle", row: "home", column: 7 },
  KeyL: { code: "KeyL", label: "L", unshifted: "l", shifted: "L", finger: "right-ring", row: "home", column: 8 },
  Semicolon: { code: "Semicolon", label: ";", unshifted: ";", shifted: ":", finger: "right-pinky", row: "home", column: 9 },
  Quote: { code: "Quote", label: "'", unshifted: "'", shifted: "\"", finger: "right-pinky", row: "home", column: 10 },
  KeyZ: { code: "KeyZ", label: "Z", unshifted: "z", shifted: "Z", finger: "left-pinky", row: "bottom", column: 0 },
  KeyX: { code: "KeyX", label: "X", unshifted: "x", shifted: "X", finger: "left-ring", row: "bottom", column: 1 },
  KeyC: { code: "KeyC", label: "C", unshifted: "c", shifted: "C", finger: "left-middle", row: "bottom", column: 2 },
  KeyV: { code: "KeyV", label: "V", unshifted: "v", shifted: "V", finger: "left-index", row: "bottom", column: 3 },
  KeyB: { code: "KeyB", label: "B", unshifted: "b", shifted: "B", finger: "left-index", row: "bottom", column: 4 },
  KeyN: { code: "KeyN", label: "N", unshifted: "n", shifted: "N", finger: "right-index", row: "bottom", column: 5 },
  KeyM: { code: "KeyM", label: "M", unshifted: "m", shifted: "M", finger: "right-index", row: "bottom", column: 6 },
  Comma: { code: "Comma", label: ",", unshifted: ",", shifted: "<", finger: "right-middle", row: "bottom", column: 7 },
  Period: { code: "Period", label: ".", unshifted: ".", shifted: ">", finger: "right-ring", row: "bottom", column: 8 },
  Slash: { code: "Slash", label: "/", unshifted: "/", shifted: "?", finger: "right-pinky", row: "bottom", column: 9 },
  ShiftLeft: { code: "ShiftLeft", label: "Shift", unshifted: "", finger: "left-pinky", row: "modifier", column: 0 },
  ShiftRight: { code: "ShiftRight", label: "Shift", unshifted: "", finger: "right-pinky", row: "modifier", column: 1 },
  Space: { code: "Space", label: "Space", unshifted: " ", finger: "right-thumb", row: "space", column: 0 },
} as const satisfies Readonly<Record<string, KeyDefinition>>;

const letterFrequencies: Record<string, number> = {};
const bigramFrequencies: Record<string, number> = {};
for (const word of filteredWords) {
  for (let index = 0; index < word.length; index += 1) {
    const letter = word[index];
    letterFrequencies[letter] = (letterFrequencies[letter] ?? 0) + 1;
    if (index > 0) {
      const bigram = word.slice(index - 1, index + 1);
      bigramFrequencies[bigram] = (bigramFrequencies[bigram] ?? 0) + 1;
    }
  }
}

export const englishPack = {
  id: "en",
  direction: "ltr",
  keyMap,
  keyboard: {
    rows: [
      { id: "top", offset: 0 },
      { id: "home", offset: 0.5 },
      { id: "bottom", offset: 1.5 },
      { id: "modifier", offset: 0 },
      { id: "space", offset: 3.5 },
    ],
  },
  unlockOrder: [
    "KeyF", "KeyJ", "KeyD", "KeyK", "KeyS", "KeyL", "KeyA", "KeyG", "KeyH",
    "KeyE", "KeyI", "KeyR", "KeyU", "KeyT", "KeyY", "KeyO", "KeyW", "KeyP", "KeyQ",
    "KeyV", "KeyN", "KeyC", "KeyM", "KeyB", "KeyX", "KeyZ", "Space",
    "Period", "Comma", "Quote", "Slash", "Semicolon",
  ],
  words: filteredWords,
  kidsWords: kidsAllowlist,
  commonWords: kidsAllowlist,
  excludedWords: blocklist,
  wordListSource: {
    name: "Alt12Dicts 2of12full",
    url: "https://github.com/en-wl/wordlist/blob/v1/alt12dicts/2of12full.txt",
    license: "Public domain, explicitly placed in the public domain by Alan Beale in the Alt12Dicts README.",
    version: "2020.12.07",
    selection:
      "Lowercase ASCII words of 2–9 characters from the source list, excluding every exact entry in BLOCKLIST.json.",
  },
  kidsWordListSource: {
    name: "wordfreq English large wordlist",
    url: "https://github.com/rspeer/wordfreq/blob/912caf64b657478d1dff1138efdc078947d54bb1/wordfreq/data/large_en.msgpack.gz",
    license: "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).",
    version: "wordfreq 3.1.1, 2022",
    selection:
      "Approximately 2,000 lowercase 2–6 letter entries in frequency order, reviewed into kids-allowlist.txt and grouped by the first unlock stage at which each word is typeable. Tier A and Tier B problem words and the project BLOCKLIST are excluded. Kids mode remains disabled pending owner approval.",
  },
  letterPatterns: {
    source: "Letter and bigram counts computed from the included Alt12Dicts 2of12full word list.",
    version: "Alt12Dicts-2020.12.07",
    frequencies: letterFrequencies,
    bigrams: bigramFrequencies,
  },
  strings: {
    startTyping: "Start typing",
    physicalKeyboardRequired: "A physical keyboard is needed to type.",
  },
} as const satisfies import("../index").LanguagePack;

export type EnglishKeyCode = keyof typeof keyMap;
export type EnglishKey = (typeof keyMap)[EnglishKeyCode];
export const englishKeys: readonly EnglishKey[] = Object.values(keyMap);
