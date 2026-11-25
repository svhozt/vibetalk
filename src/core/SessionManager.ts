import { EventEmitter } from "node:events";
import type { IHotkeyListener } from "../hotkey/types.js";
import { errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import type { Pipeline } from "./Pipeline.js";

/**
 * Wires toggle inputs (Enter, global hotkey) to the pipeline and handles shutdown.
 * Events: "error" (Error), "shutdown".
 */
export class SessionManager extends EventEmitter {
  private busy = false;
  private shuttingDown = false;

  constructor(
    private readonly pipeline: Pipeline,
    private triggers: IHotkeyListener[],
  ) {
    super();
    for (const l of triggers) {
      l.onToggle((fromTerminal) => void this.toggle({ typeTail: !fromTerminal }));
      l.onQuit?.(() => void this.shutdown(0));
    }
  }

  /** Start all toggle inputs. Inputs that fail are dropped and returned (the rest keep working). */
  async initialize(): Promise<Error[]> {
    const failures: Error[] = [];
    for (const l of [...this.triggers]) {
      try {
        await l.start();
      } catch (err) {
        failures.push(err instanceof Error ? err : new Error(errorMessage(err)));
        this.triggers = this.triggers.filter((x) => x !== l);
      }
    }
    const onSignal = () => {
      if (this.shuttingDown) {
        logger.warn("Forced exit.");
        process.exit(130);
      }
      void this.shutdown(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    return failures;
  }

  get activeTriggers(): string[] {
    return this.triggers.map((l) => l.label);
  }

  /** `typeTail: false` = the terminal has focus, so don't type the final words into it. */
  async toggle(opts: { typeTail?: boolean } = {}): Promise<void> {
    if (this.busy || this.shuttingDown) return;
    this.busy = true;
    try {
      const state = this.pipeline.getState();
      if (state === "idle") await this.pipeline.start();
      else if (state === "recording") await this.pipeline.stop({ typeTail: opts.typeTail ?? true });
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      this.busy = false;
    }
  }

  async shutdown(code = 0, opts: { typeTail?: boolean } = {}): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    try {
      // Finish the current recording. Ctrl+C is pressed in this terminal, so by
      // default the final words are shown here rather than typed into it.
      if (this.pipeline.getState() === "recording") await this.pipeline.stop({ typeTail: opts.typeTail ?? false });
    } catch (err) {
      logger.debug("Error while stopping:", errorMessage(err));
    }
    for (const l of this.triggers) {
      try {
        await l.stop();
      } catch {
        // ignore
      }
    }
    this.emit("shutdown");
    process.exit(code);
  }
}
