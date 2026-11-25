import type { EventEmitter } from "node:events";

/**
 * A source of 16 kHz mono audio.
 * Events:
 *  - "frame" (samples: Float32Array)  samples in [-1, 1]
 *  - "silent"                         the input has delivered only digital silence for a while
 *  - "dropped" (seconds: number)      audio was lost because the process fell behind
 *  - "end"                            a finite source (file) ran out
 *  - "error" (err: Error)
 */
export interface AudioSource extends EventEmitter {
  readonly label: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Samples per frame: 32 ms at 16 kHz. */
export const FRAME_LENGTH = 512;
