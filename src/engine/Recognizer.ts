import os from "node:os";
import { createRequire } from "node:module";
import type { OnlineRecognizer, OnlineStream } from "sherpa-onnx-node";
import { ModelError, errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { isInstalled, modelPaths } from "./ModelManager.js";
import { baseLanguage, supportsLanguage, type ModelSpec } from "./registry.js";

export const SAMPLE_RATE = 16000;

type SherpaModule = typeof import("sherpa-onnx-node").default;
let sherpaModule: SherpaModule | null = null;

/** Load the native addon lazily so `--help`, `config`, etc. never pay for it. */
export function loadSherpa(): SherpaModule {
  if (!sherpaModule) {
    const require = createRequire(import.meta.url);
    try {
      sherpaModule = require("sherpa-onnx-node") as SherpaModule;
    } catch (err) {
      throw new ModelError(
        `Could not load the speech engine (sherpa-onnx-node) for ${process.platform}-${process.arch}: ${errorMessage(err)}\n` +
          "Try reinstalling: npm install -g vibetalk",
      );
    }
  }
  return sherpaModule;
}

/**
 * Normalise raw recogniser output for typing: drop special tags such as
 * language markers, collapse runs of whitespace, strip leading space.
 * Appending to the raw text only ever appends to the cleaned text.
 */
export function cleanTranscript(raw: string): string {
  return raw.replace(/<[^<>\s]{1,16}>/g, " ").replace(/\s+/g, " ").replace(/^ /, "");
}

export interface RecognizerOptions {
  /** ISO code, locale like "en-US", or "auto" (multilingual models only). */
  language?: string;
  numThreads?: number;
}

/** Characters after which a long session is rolled over to a fresh stream at the next pause. */
const ROLLOVER_CHARS = 4000;

/**
 * Silence fed at the start of every stream. Streaming encoders have no left
 * context for the very first frames, so speech that starts immediately after
 * the stream opens loses its first word (e.g. "Alles hat ein Ende" →
 * "hat ein Ende"). Half a second of priming fixes it and is processed before
 * the first microphone frame arrives.
 */
const LEAD_IN_SECONDS = 0.5;

/** Silence fed when a session ends so the model can emit its last words. */
const TAIL_SECONDS = 1.5;

/**
 * A recording session: one continuous recogniser stream.
 *
 * The stream is deliberately NOT reset at pauses. Resetting a cache-aware
 * streaming model mid-dictation drops or garbles the first word after the
 * reset and loses end-of-sentence punctuation (measured: Nemotron WER 16% with
 * per-pause resets vs 6.5% without). Pauses are only reported as signals.
 */
export class RecognitionSession {
  private stream: OnlineStream;
  private prefix = "";
  private current = "";
  private finished = false;

  constructor(
    private readonly rec: OnlineRecognizer,
    private readonly language: string | undefined,
  ) {
    this.stream = this.newStream();
  }

  private newStream(): OnlineStream {
    const stream = this.rec.createStream();
    if (this.language) stream.setOption("language", this.language);
    stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: new Float32Array(SAMPLE_RATE * LEAD_IN_SECONDS) });
    while (this.rec.isReady(stream)) this.rec.decode(stream);
    return stream;
  }

  /** Feed 16 kHz mono float samples in [-1, 1]. Returns the full session transcript so far. */
  accept(samples: Float32Array): string {
    if (this.finished) return this.text;
    this.stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
    while (this.rec.isReady(this.stream)) this.rec.decode(this.stream);
    this.current = cleanTranscript(this.rec.getResult(this.stream).text);

    if (this.current.length > ROLLOVER_CHARS && this.rec.isEndpoint(this.stream)) {
      logger.debug("Long session: rolling over to a fresh recogniser stream at a pause");
      this.prefix = this.text.replace(/\s*$/, " ");
      this.current = "";
      this.rec.reset(this.stream);
    }
    return this.text;
  }

  /** True while the speaker is pausing (trailing silence after some speech). */
  isPause(): boolean {
    return !this.finished && this.current.length > 0 && this.rec.isEndpoint(this.stream);
  }

  /** Flush the model with trailing silence and return the final transcript. */
  finish(): string {
    if (this.finished) return this.text;
    // Kroko emits words up to ~1.2 s late; less padding loses the last words.
    this.stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: new Float32Array(SAMPLE_RATE * TAIL_SECONDS) });
    this.stream.inputFinished();
    while (this.rec.isReady(this.stream)) this.rec.decode(this.stream);
    this.current = cleanTranscript(this.rec.getResult(this.stream).text);
    this.finished = true;
    return this.text;
  }

  get text(): string {
    return this.prefix + this.current;
  }
}

export class Recognizer {
  readonly spec: ModelSpec;
  readonly language: string | undefined;
  readonly loadMs: number;
  private readonly rec: OnlineRecognizer;

  constructor(spec: ModelSpec, options: RecognizerOptions = {}) {
    if (!isInstalled(spec)) {
      throw new ModelError(`Model "${spec.id}" is not installed. Run: vibetalk models download ${spec.id}`);
    }
    const language = options.language ?? "auto";
    if (!supportsLanguage(spec, language) && !(baseLanguage(language) === "auto" && !spec.multilingual)) {
      throw new ModelError(
        `Model "${spec.id}" does not support language "${language}". Supported: ${spec.languages.join(", ")}.`,
      );
    }
    this.spec = spec;
    // Multilingual models take a per-stream language prompt; leaving it unset = auto-detect.
    this.language = spec.multilingual && baseLanguage(language) !== "auto" ? language : undefined;

    const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
    const numThreads = Math.max(1, Math.min(options.numThreads || spec.numThreads, cores));
    const paths = modelPaths(spec);
    const sherpa = loadSherpa();
    const started = performance.now();
    try {
      this.rec = new sherpa.OnlineRecognizer({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: spec.featureDim },
        modelConfig: {
          transducer: { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner },
          tokens: paths.tokens,
          numThreads,
          provider: "cpu",
          debug: 0,
        },
        decodingMethod: "greedy_search",
        enableEndpoint: 1,
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 0.5,
        rule3MinUtteranceLength: 300,
      });
    } catch (err) {
      throw new ModelError(
        `Failed to load model "${spec.id}": ${errorMessage(err)}\nThe files may be damaged — try: vibetalk models download ${spec.id}`,
      );
    }
    this.loadMs = performance.now() - started;
    logger.debug(`Loaded ${spec.id} in ${Math.round(this.loadMs)} ms (${numThreads} threads, language: ${this.language ?? "auto"})`);
  }

  createSession(): RecognitionSession {
    return new RecognitionSession(this.rec, this.language);
  }
}
