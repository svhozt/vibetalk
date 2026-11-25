import type { TypeMode } from "../core/TextCommitter.js";
import type { TypingStrategy } from "../typing/types.js";

export interface VibeTalkConfig {
  /** Model id from `vibetalk models`, or "auto" = lightest model for `language`. */
  model: string;
  /** ISO 639-1 code (en, de, …) or "auto" = the model's language / auto-detect on multilingual models. */
  language: string;
  typingStrategy: TypingStrategy;
  typeMode: TypeMode;
  typingDelayMs: number;
  deviceIndex: number;
  hotkey: string;
  /** 0 = model default. */
  numThreads: number;
}

export const CONFIG_KEYS: (keyof VibeTalkConfig)[] = [
  "model",
  "language",
  "typingStrategy",
  "typeMode",
  "typingDelayMs",
  "deviceIndex",
  "hotkey",
  "numThreads",
];
