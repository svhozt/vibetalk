import { createRequire } from "node:module";
import * as logger from "../utils/logger.js";
import type { ITyper } from "./types.js";

export interface Robot {
  typeString(text: string): void;
  keyTap(key: string, modifier?: string | string[]): void;
  setKeyboardDelay?(ms: number): void;
}

let robot: Robot | null | undefined;

/** robotjs is an optional native dependency; returns null if it is not installed or fails to load. */
export function loadRobot(): Robot | null {
  if (robot !== undefined) return robot;
  try {
    const require = createRequire(import.meta.url);
    const mod = require("@hurdlegroup/robotjs") as Robot & { default?: Robot };
    robot = mod.default ?? mod;
    robot.setKeyboardDelay?.(0);
  } catch (err) {
    logger.debug("robotjs not available:", err instanceof Error ? err.message : err);
    robot = null;
  }
  return robot;
}

/** Types text with synthetic key events (robotjs), one character at a time. */
export class KeyboardTyper implements ITyper {
  readonly name = "robotjs";
  readonly prefersPhrases = false;

  constructor(private readonly delayMs: number = 8) {}

  async isAvailable(): Promise<boolean> {
    return loadRobot() !== null;
  }

  async type(text: string, signal?: AbortSignal): Promise<void> {
    const r = loadRobot();
    if (!r) throw new Error("robotjs is not available");
    if (this.delayMs <= 0) {
      if (!signal?.aborted) r.typeString(text);
      return;
    }
    for (const char of text) {
      if (signal?.aborted) return;
      r.typeString(char);
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }
}
