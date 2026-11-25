import chalk from "chalk";
import { decodeAudioFile } from "../audio/FileSource.js";
import { FRAME_LENGTH } from "../audio/types.js";
import { Recognizer, SAMPLE_RATE } from "../engine/Recognizer.js";
import { ensureModelInstalled, resolveModel } from "../engine/resolve.js";
import { ConfigError } from "../utils/errors.js";
import * as logger from "../utils/logger.js";

export interface TranscribeOptions {
  model?: string;
  language?: string;
  threads?: string;
  json?: boolean;
  verbose?: boolean;
}

/** Transcribe an audio file through the same streaming engine used for dictation. */
export async function transcribeCommand(file: string, options: TranscribeOptions): Promise<void> {
  if (options.verbose) logger.setVerbose(true);
  const threads = options.threads === undefined ? undefined : Number(options.threads);
  if (threads !== undefined && !Number.isInteger(threads)) throw new ConfigError("--threads must be an integer");

  const { spec, language } = resolveModel(options.model, options.language);
  const samples = decodeAudioFile(file);
  await ensureModelInstalled(spec);
  const recognizer = new Recognizer(spec, { language, numThreads: threads });

  const session = recognizer.createSession();
  const t0 = performance.now();
  let firstTextAt: number | null = null;
  for (let off = 0; off < samples.length; off += FRAME_LENGTH) {
    const text = session.accept(samples.subarray(off, off + FRAME_LENGTH));
    if (firstTextAt === null && text.length > 0) firstTextAt = (off + FRAME_LENGTH) / SAMPLE_RATE;
  }
  const text = session.finish().trim();
  const elapsed = (performance.now() - t0) / 1000;
  const duration = samples.length / SAMPLE_RATE;

  if (options.json) {
    console.log(
      JSON.stringify({
        file,
        model: spec.id,
        language: recognizer.language ?? (spec.multilingual ? "auto" : spec.languages[0]),
        text,
        audioSeconds: +duration.toFixed(3),
        processingSeconds: +elapsed.toFixed(3),
        realTimeFactor: +(elapsed / Math.max(duration, 1e-6)).toFixed(4),
        loadMs: Math.round(recognizer.loadMs),
      }),
    );
    return;
  }
  console.log(text);
  if (process.stderr.isTTY) {
    console.error(
      chalk.gray(`\n  ${spec.id} · ${duration.toFixed(1)}s audio in ${elapsed.toFixed(2)}s (${(duration / Math.max(elapsed, 1e-6)).toFixed(0)}× real time)`),
    );
  }
}
