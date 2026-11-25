import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { loadSherpa, SAMPLE_RATE } from "../engine/Recognizer.js";
import { AudioError, errorMessage } from "../utils/errors.js";
import { FRAME_LENGTH, type AudioSource } from "./types.js";

/**
 * Decode an audio file to 16 kHz mono float samples.
 * WAV is read natively; other formats (mp3, m4a, flac, …) need ffmpeg on PATH.
 */
export function decodeAudioFile(file: string): Float32Array {
  if (!fs.existsSync(file)) throw new AudioError(`File not found: ${file}`);
  if (path.extname(file).toLowerCase() === ".wav") {
    try {
      const wave = loadSherpa().readWave(file);
      if (wave.sampleRate === SAMPLE_RATE) return wave.samples;
    } catch {
      // fall through to ffmpeg (e.g. 24-bit or float WAV)
    }
  }
  const result = spawnSync(
    "ffmpeg",
    ["-nostdin", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1"],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  if (result.error) {
    throw new AudioError(
      `Cannot read ${path.basename(file)}: only 16 kHz 16-bit WAV is supported without ffmpeg (${errorMessage(result.error)}).\n` +
        "Install ffmpeg, or convert first: ffmpeg -i input.m4a -ar 16000 -ac 1 output.wav",
    );
  }
  if (result.status !== 0) {
    throw new AudioError(`ffmpeg could not decode ${path.basename(file)}: ${result.stderr.toString().trim()}`);
  }
  const buf = result.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice();
}

/** Plays an audio file into the pipeline as 32 ms frames, optionally at real-time pace. */
export class FileSource extends EventEmitter implements AudioSource {
  readonly label: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly samples: Float32Array,
    label: string,
    private readonly realtime: boolean,
  ) {
    super();
    this.label = label;
  }

  static fromFile(file: string, realtime: boolean): FileSource {
    return new FileSource(decodeAudioFile(file), path.basename(file), realtime);
  }

  get durationSeconds(): number {
    return this.samples.length / SAMPLE_RATE;
  }

  async start(): Promise<void> {
    this.running = true;
    let offset = 0;
    const startedAt = performance.now();
    const tick = () => {
      if (!this.running) return;
      if (offset >= this.samples.length) {
        this.running = false;
        this.emit("end");
        return;
      }
      const frame = this.samples.subarray(offset, offset + FRAME_LENGTH);
      offset += FRAME_LENGTH;
      this.emit("frame", frame);
      if (this.realtime) {
        const due = startedAt + (offset / SAMPLE_RATE) * 1000;
        this.timer = setTimeout(tick, Math.max(0, due - performance.now()));
      } else {
        this.timer = setImmediate(tick) as unknown as NodeJS.Timeout;
      }
    };
    tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      clearImmediate(this.timer as unknown as NodeJS.Immediate);
      this.timer = null;
    }
  }
}
