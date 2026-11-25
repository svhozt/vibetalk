import { execFileSync } from "node:child_process";
import * as logger from "../utils/logger.js";
import { isLinux, isMac, isWindows } from "../utils/platform.js";
import { loadRobot } from "./KeyboardTyper.js";
import type { ITyper } from "./types.js";

/** Pastes text via the clipboard (restoring the previous clipboard afterwards). */
export class ClipboardTyper implements ITyper {
  readonly name = "clipboard";
  readonly prefersPhrases = true;

  async isAvailable(): Promise<boolean> {
    try {
      await import("clipboardy");
      return true;
    } catch {
      return false;
    }
  }

  async type(text: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || text.length === 0) return;
    const clipboard = (await import("clipboardy")).default;

    let original: string | null = null;
    try {
      original = await clipboard.read();
    } catch {
      original = null;
    }

    await clipboard.write(text);
    this.paste();

    // Give the target app time to read the clipboard before restoring it.
    await new Promise((r) => setTimeout(r, 300));
    if (original !== null) {
      try {
        await clipboard.write(original);
      } catch {
        // ignore restore errors
      }
    }
  }

  private paste(): void {
    const robot = loadRobot();
    if (robot) {
      robot.keyTap("v", isMac() ? "command" : "control");
      return;
    }
    try {
      if (isMac()) {
        execFileSync("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
      } else if (isLinux()) {
        try {
          execFileSync("xdotool", ["key", "--clearmodifiers", "ctrl+v"], { stdio: "ignore" });
        } catch {
          execFileSync("ydotool", ["key", "29:1", "47:1", "47:0", "29:0"], { stdio: "ignore" });
        }
      } else if (isWindows()) {
        execFileSync("powershell", [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ]);
      }
    } catch (err) {
      logger.warn("Could not simulate the paste keystroke:", err instanceof Error ? err.message : err);
    }
  }
}
