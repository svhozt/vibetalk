export type TypingStrategy = "auto" | "robotjs" | "clipboard" | "none";

export const TYPING_STRATEGIES: TypingStrategy[] = ["auto", "robotjs", "clipboard", "none"];

export interface ITyper {
  readonly name: Exclude<TypingStrategy, "auto">;
  /** Typing word-by-word makes no sense for this typer (e.g. clipboard paste). */
  readonly prefersPhrases: boolean;
  isAvailable(): Promise<boolean>;
  type(text: string, signal?: AbortSignal): Promise<void>;
}
