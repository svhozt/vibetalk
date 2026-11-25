export type PipelineState = "idle" | "recording" | "stopping";

export interface TranscriptUpdate {
  /** Full transcript of the current session. */
  text: string;
  /** Prefix of `text` that has been sent to the typer. */
  committed: string;
  final: boolean;
}

export interface SessionStats {
  durationMs: number;
  audioSeconds: number;
  charactersTyped: number;
  words: number;
  /** Compute time / audio time for recognition (lower is faster). */
  realTimeFactor: number;
  text: string;
  /** Final words that were not typed because the session was stopped from the terminal. */
  untypedTail: string;
}
