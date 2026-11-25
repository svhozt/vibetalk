import { EventEmitter } from "node:events";
import { AudioError, errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { microphoneInstructions } from "../utils/platform.js";
import { FRAME_LENGTH, type AudioSource } from "./types.js";

type PvRecorderClass = typeof import("@picovoice/pvrecorder-node").PvRecorder;
type PvRecorderInstance = InstanceType<PvRecorderClass>;

let PvRecorderCtor: PvRecorderClass | null = null;

async function loadPvRecorder(): Promise<PvRecorderClass> {
  if (!PvRecorderCtor) {
    try {
      PvRecorderCtor = (await import("@picovoice/pvrecorder-node")).PvRecorder;
    } catch (err) {
      throw new AudioError(`Could not load the audio recorder for ${process.platform}-${process.arch}: ${errorMessage(err)}`);
    }
  }
  return PvRecorderCtor;
}

export async function listInputDevices(): Promise<string[]> {
  return (await loadPvRecorder()).getAvailableDevices();
}

/** Seconds of exact digital silence after which we warn (permission denied often looks like this). */
const SILENCE_WARNING_SECONDS = 2;
/** PvRecorder ring buffer: ~16 s of audio, so a busy system doesn't drop frames. */
const BUFFERED_FRAMES = 500;

/** Microphone capture via PvRecorder (16 kHz, 16-bit, mono) converted to float frames. */
export class MicSource extends EventEmitter implements AudioSource {
  private recorder: PvRecorderInstance | null = null;
  private running = false;
  private loop: Promise<void> | null = null;
  label = "microphone";

  constructor(private readonly deviceIndex: number = -1) {
    super();
  }

  async start(): Promise<void> {
    if (this.running) return;
    const PvRecorder = await loadPvRecorder();
    try {
      this.recorder = new PvRecorder(FRAME_LENGTH, this.deviceIndex, BUFFERED_FRAMES);
      this.label = this.recorder.getSelectedDevice() || "default microphone";
      this.recorder.start();
    } catch (err) {
      this.recorder?.release();
      this.recorder = null;
      const msg = errorMessage(err);
      if (this.deviceIndex >= 0 && /index|device/i.test(msg)) {
        throw new AudioError(`Audio device ${this.deviceIndex} is not available (${msg}). Run \`vibetalk devices\` to list inputs.`);
      }
      throw new AudioError(`Could not start the microphone: ${msg}\n${microphoneInstructions()}`);
    }
    this.running = true;
    logger.debug(`Microphone started: ${this.label}`);
    this.loop = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    let silentSamples = 0;
    let warned = false;
    const startedAt = performance.now();
    let received = 0;
    let lastLagCheck = startedAt;
    let reportedLag = 0;
    while (this.running && this.recorder) {
      let pcm: Int16Array;
      const readStarted = performance.now();
      try {
        pcm = await this.recorder.read();
      } catch (err) {
        if (this.running) this.emit("error", new AudioError(`Microphone read failed: ${errorMessage(err)}`));
        break;
      }
      if (!this.running) break;
      const frame = new Float32Array(pcm.length);
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) {
        const v = pcm[i]!;
        frame[i] = v / 32768;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      if (!warned) {
        silentSamples = peak === 0 ? silentSamples + pcm.length : 0;
        if (silentSamples >= SILENCE_WARNING_SECONDS * 16000) {
          warned = true;
          this.emit("silent");
        } else if (peak > 0) {
          warned = true; // got real signal; stop checking
        }
      }
      received += pcm.length;
      const now = performance.now();
      // Only judge after a read that had to wait for fresh audio: the buffer is
      // then empty, so any remaining gap is audio that was really lost.
      const waitedForAudio = now - readStarted > 10;
      if (waitedForAudio && now - lastLagCheck > 2000) {
        lastLagCheck = now;
        // Audio received should keep pace with the wall clock; a growing gap means dropped frames.
        const lag = (now - startedAt) / 1000 - received / 16000;
        if (lag - reportedLag > 1) {
          logger.debug(`Microphone: ${lag.toFixed(2)}s of audio missing`);
          this.emit("dropped", lag - reportedLag);
          reportedLag = lag;
        }
      }
      this.emit("frame", frame);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    try {
      this.recorder?.stop();
    } catch {
      // ignore
    }
    await this.loop?.catch(() => undefined);
    this.loop = null;
    try {
      this.recorder?.release();
    } catch {
      // ignore
    }
    this.recorder = null;
    logger.debug("Microphone stopped");
  }
}
