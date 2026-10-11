export type TextDirection = "ltr" | "rtl";

export type KeyboardRow = string;

export type Finger =
  | "left-pinky"
  | "left-ring"
  | "left-middle"
  | "left-index"
  | "left-thumb"
  | "right-thumb"
  | "right-index"
  | "right-middle"
  | "right-ring"
  | "right-pinky";

export interface KeyDefinition {
  readonly code: string;
  readonly label: string;
  readonly unshifted: string;
  readonly shifted?: string;
  readonly finger: Finger;
  readonly row: KeyboardRow;
  readonly column: number;
}

export interface KeyboardRowDefinition {
  readonly id: KeyboardRow;
  readonly offset: number;
}

export interface LetterPatternStatistics {
  readonly source: string;
  readonly version: string;
  readonly frequencies: Readonly<Record<string, number>>;
  readonly bigrams: Readonly<Record<string, number>>;
}

export interface LanguagePack {
  readonly id: string;
  readonly direction: TextDirection;
  readonly keyMap: Readonly<Record<string, KeyDefinition>>;
  readonly keyboard: {
    readonly rows: readonly KeyboardRowDefinition[];
  };
  readonly unlockOrder: readonly string[];
  readonly words: readonly string[];
  readonly kidsWords: readonly string[];
  readonly wordListSource: {
    readonly name: string;
    readonly url: string;
    readonly license: string;
    readonly version: string;
    readonly selection: string;
  };
  readonly kidsWordListSource: {
    readonly name: string;
    readonly url: string;
    readonly license: string;
    readonly version: string;
    readonly selection: string;
  };
  readonly letterPatterns: LetterPatternStatistics;
  readonly strings: Readonly<Record<string, string>>;
}

export { englishKeys, englishPack, filterBlockedWords } from "./en";
