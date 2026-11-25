import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { AudioSource } from "../audio/types.js";
import type { RecognitionSession, Recognizer } from "../engine/Recognizer.js";
import { SAMPLE_RATE } from "../engine/Recognizer.js";
import type { ITyper } from "../typing/types.js";
import { errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { TextCommitter, type TypeMode } from "./TextCommitter.js";
import type { PipelineState, SessionStats, TranscriptUpdate } from "./types.js";

export interface PipelineOptions {
  typeMode: TypeMode;
  /** Creates the audio source for each recording session. */
  createSource: () => AudioSource;
}

/**
 * Audio → streaming recogniser → committer → typer.
 *
 * Events: "state" (PipelineState), "transcript" (TranscriptUpdate),
 * "sessionEnd" (SessionStats), "warning" (string), "error" (Error), "sourceEnded".
 */
export class Pipeline extends EventEmitter {
  private state: PipelineState = "idle";
  private source: AudioSource | null = null;
  private session: RecognitionSession | null = null;
  private readonly committer: TextCommitter;
  private typing: Promise<void> = Promise.resolve();
  private typedAnything = false;
  private startedAt = 0;
  private samples = 0;
  private computeMs = 0;
  private charsTyped = 0;
  private readonly typedLog = process.env["VIBETALK_TYPED_LOG"];
  readonly typeMode: TypeMode;

  constructor(
    private readonly recognizer: Recognizer,
    private readonly typer: ITyper,
    private readonly options: PipelineOptions,
  ) {
    super();
    // Pasting word-by-word through the clipboard would be slow and flickery.
    this.typeMode = typer.prefersPhrases ? "phrase" : options.typeMode;
    this.committer = new TextCommitter(this.typeMode);
  }

  getState(): PipelineState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    this.session = this.recognizer.createSession();
    this.committer.startSession(this.typedAnything);
    this.startedAt = Date.now();
    this.samples = 0;
    this.computeMs = 0;
    this.charsTyped = 0;

    const source = this.options.createSource();
    this.source = source;
    source.on("frame", this.onFrame);
    source.on("silent", this.onSilent);
    source.on("dropped", this.onDropped);
    source.on("end", this.onSourceEnd);
    source.on("error", this.onSourceError);
    try {
      await source.start();
    } catch (err) {
      this.detach(source);
      this.source = null;
      this.session = null;
      throw err;
    }
    this.setState("recording");
  }

  /**
   * Stop recording. `typeTail: false` keeps the last, not-yet-typed words out
   * of the focused window (used when the user stopped from this terminal);
   * they are reported in `SessionStats.untypedTail` instead.
   */
  async stop(opts: { typeTail?: boolean } = {}): Promise<SessionStats | null> {
    if (this.state !== "recording") return null;
    this.setState("stopping");
    const source = this.source!;
    await source.stop();
    this.detach(source);
    this.source = null;

    const session = this.session!;
    this.session = null;
    const t0 = performance.now();
    const text = session.finish();
    this.computeMs += performance.now() - t0;
    const tail = this.committer.update(text, { final: true });
    const typeTail = opts.typeTail ?? true;
    if (typeTail) this.commit(tail);
    this.emit("transcript", { text, committed: this.committer.committed, final: true } satisfies TranscriptUpdate);

    // Let everything recognised so far reach the cursor before reporting.
    await this.typing;

    const audioSeconds = this.samples / SAMPLE_RATE;
    const stats: SessionStats = {
      durationMs: Date.now() - this.startedAt,
      audioSeconds,
      charactersTyped: this.charsTyped,
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      realTimeFactor: audioSeconds > 0 ? this.computeMs / 1000 / audioSeconds : 0,
      text,
      // Only report words; a lone final "." left out is not worth a warning.
      untypedTail: typeTail || !/[\p{L}\p{N}]/u.test(tail) ? "" : tail.trim(),
    };
    this.setState("idle");
    this.emit("sessionEnd", stats);
    return stats;
  }

  private readonly onFrame = (frame: Float32Array) => {
    const session = this.session;
    if (!session || this.state !== "recording") return;
    const t0 = performance.now();
    let text: string;
    let pause: boolean;
    try {
      text = session.accept(frame);
      pause = session.isPause();
    } catch (err) {
      this.emit("error", new Error(`Recognition failed: ${errorMessage(err)}`));
      return;
    }
    this.computeMs += performance.now() - t0;
    this.samples += frame.length;
    this.commit(this.committer.update(text, { pause }));
    this.emit("transcript", { text, committed: this.committer.committed, final: false } satisfies TranscriptUpdate);
  };

  private readonly onSilent = () => {
    this.emit(
      "warning",
      "The microphone is delivering pure silence. Check that the right input is selected (vibetalk devices) and that your terminal has microphone permission.",
    );
  };

  private readonly onDropped = (seconds: number) => {
    this.emit("warning", `${seconds.toFixed(1)}s of microphone audio was lost because the system was too busy — some words may be missing.`);
  };

  private readonly onSourceEnd = () => {
    this.emit("sourceEnded");
  };

  private readonly onSourceError = (err: Error) => {
    this.emit("error", err);
    void this.stop();
  };

  private commit(delta: string): void {
    if (!delta) return;
    this.typedAnything = true;
    this.charsTyped += delta.length;
    logger.debug(`type ${JSON.stringify(delta)}`);
    if (this.typedLog) {
      try {
        fs.appendFileSync(this.typedLog, delta);
      } catch {
        // test hook only
      }
    }
    this.typing = this.typing
      .then(() => this.typer.type(delta))
      .catch((err: unknown) => {
        this.emit("error", new Error(`Typing failed: ${errorMessage(err)}`));
      });
  }

  private detach(source: AudioSource): void {
    source.off("frame", this.onFrame);
    source.off("silent", this.onSilent);
    source.off("dropped", this.onDropped);
    source.off("end", this.onSourceEnd);
    source.off("error", this.onSourceError);
  }

  private setState(state: PipelineState): void {
    this.state = state;
    this.emit("state", state);
  }
}
