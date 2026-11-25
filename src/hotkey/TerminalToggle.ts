import * as readline from "node:readline";
import * as logger from "../utils/logger.js";
import type { IHotkeyListener } from "./types.js";

/** Press Enter in the VibeTalk terminal to start / stop. */
export class TerminalToggle implements IHotkeyListener {
  readonly label = "Enter";
  /** Enter typed into an interactive terminal means that terminal has keyboard focus. */
  readonly focusesTerminal = !!process.stdin.isTTY;
  private rl: readline.Interface | null = null;
  private toggleCallback: ((fromTerminal: boolean) => void) | null = null;
  private quitCallback: (() => void) | null = null;

  async start(): Promise<void> {
    this.rl = readline.createInterface({ input: process.stdin, terminal: false });
    this.rl.on("line", () => {
      logger.debug("Enter pressed");
      this.toggleCallback?.(this.focusesTerminal);
    });
    // stdin closed (Ctrl+D, or the parent process ended the pipe)
    this.rl.on("close", () => {
      if (this.rl) this.quitCallback?.();
    });
  }

  async stop(): Promise<void> {
    const rl = this.rl;
    this.rl = null;
    rl?.close();
  }

  onToggle(callback: (fromTerminal: boolean) => void): void {
    this.toggleCallback = callback;
  }

  onQuit(callback: () => void): void {
    this.quitCallback = callback;
  }
}
