import { TypingError } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { isWayland } from "../utils/platform.js";
import { ClipboardTyper } from "./ClipboardTyper.js";
import { KeyboardTyper } from "./KeyboardTyper.js";
import { NoneTyper } from "./NoneTyper.js";
import type { ITyper, TypingStrategy } from "./types.js";

export async function createTyper(strategy: TypingStrategy, delayMs: number): Promise<ITyper> {
  switch (strategy) {
    case "none":
      return new NoneTyper();
    case "robotjs": {
      const typer = new KeyboardTyper(delayMs);
      if (await typer.isAvailable()) return typer;
      throw new TypingError("robotjs is not available on this system. Try: --typing-strategy clipboard");
    }
    case "clipboard": {
      const typer = new ClipboardTyper();
      if (await typer.isAvailable()) return typer;
      throw new TypingError("Clipboard access is not available on this system.");
    }
    case "auto": {
      // Synthetic key events (XTest) don't reach native Wayland apps; paste instead.
      const candidates: ITyper[] = isWayland()
        ? [new ClipboardTyper(), new KeyboardTyper(delayMs)]
        : [new KeyboardTyper(delayMs), new ClipboardTyper()];
      for (const typer of candidates) {
        if (await typer.isAvailable()) {
          logger.debug(`Typing strategy: ${typer.name}`);
          return typer;
        }
      }
      throw new TypingError("No way to type text on this system. Use --typing-strategy none to only show the transcript.");
    }
    default:
      throw new TypingError(`Unknown typing strategy "${String(strategy)}". Use auto, robotjs, clipboard or none.`);
  }
}
