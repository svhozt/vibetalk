import chalk from "chalk";
import type { PipelineState, SessionStats, TranscriptUpdate } from "../core/types.js";
import { formatDuration } from "../utils/format.js";

export interface HeaderInfo {
  model: string;
  language: string;
  input: string;
  typing: string;
  triggers: string[];
}

const RENDER_INTERVAL_MS = 50;

/** Live terminal display: header, status line, streaming transcript. */
export class TerminalUI {
  private readonly tty = !!process.stdout.isTTY;
  private liveLineActive = false;
  private lastRender = 0;
  private pendingRender: NodeJS.Timeout | null = null;
  private latest: TranscriptUpdate | null = null;
  private triggerHint = "Enter";

  constructor(private readonly typingEnabled = true) {}

  showHeader(info: HeaderInfo): void {
    this.triggerHint = info.triggers.join(" or ");
    const row = (k: string, v: string) => console.log(`  ${chalk.gray(k.padEnd(9))}${v}`);
    console.log();
    console.log(`  ${chalk.bold.cyan("VibeTalk")} ${chalk.gray("— local real-time dictation")}`);
    console.log(chalk.gray("  ─────────────────────────────────────────────"));
    row("model", info.model);
    row("language", info.language);
    row("input", info.input);
    row("typing", info.typing);
    console.log(chalk.gray("  ─────────────────────────────────────────────"));
    console.log(`  ${chalk.green(this.triggerHint)} ${chalk.gray("→ start / stop")}    ${chalk.red("Ctrl+C")} ${chalk.gray("→ quit")}`);
    console.log(chalk.gray("  Text is typed wherever your cursor is — switch to the target app after starting."));
    console.log();
  }

  onState(state: PipelineState): void {
    switch (state) {
      case "recording":
        this.clearLive();
        console.log(`  ${chalk.red.bold("●")} ${chalk.bold("Listening")} ${chalk.gray(`— speak now; ${this.triggerHint} to stop`)}`);
        break;
      case "stopping":
        break;
      case "idle":
        break;
    }
  }

  onTranscript(update: TranscriptUpdate): void {
    this.latest = update;
    if (update.final) {
      this.flushRender();
      return;
    }
    if (!this.tty) return;
    const now = Date.now();
    if (now - this.lastRender >= RENDER_INTERVAL_MS) {
      this.render();
    } else if (!this.pendingRender) {
      this.pendingRender = setTimeout(() => this.render(), RENDER_INTERVAL_MS);
    }
  }

  private flushRender(): void {
    if (this.pendingRender) clearTimeout(this.pendingRender);
    this.pendingRender = null;
    this.clearLive();
    const text = this.latest?.text.trim() ?? "";
    if (text) console.log(`  ${chalk.green("✓")} ${text}`);
  }

  private render(): void {
    this.pendingRender = null;
    this.lastRender = Date.now();
    const u = this.latest;
    if (!u || !this.tty) return;
    const width = Math.max(20, (process.stdout.columns || 80) - 6);
    const committed = u.committed;
    const pending = u.text.slice(committed.length);
    let shownCommitted = committed;
    let shownPending = pending;
    const total = committed.length + pending.length;
    if (total > width) {
      const cut = total - width + 1;
      if (cut >= committed.length) {
        shownCommitted = "";
        shownPending = "…" + pending.slice(cut - committed.length);
      } else {
        shownCommitted = "…" + committed.slice(cut);
      }
    }
    process.stdout.write(`\r\x1b[2K  ${chalk.green(shownCommitted)}${chalk.gray(shownPending)}`);
    this.liveLineActive = true;
  }

  private clearLive(): void {
    if (this.liveLineActive && this.tty) process.stdout.write("\r\x1b[2K");
    this.liveLineActive = false;
  }

  onSessionEnd(stats: SessionStats): void {
    if (stats.untypedTail) {
      console.log(
        chalk.yellow(`  ⚠ Not typed (this terminal had focus): "${stats.untypedTail}"`) +
          chalk.gray(" — pause a moment before switching back, or use --hotkey."),
      );
    }
    const parts = [
      formatDuration(stats.durationMs),
      `${stats.words} words`,
      ...(this.typingEnabled ? [`${stats.charactersTyped} chars typed`] : []),
    ];
    console.log(chalk.gray(`  ○ Stopped — ${parts.join(" · ")}. ${this.triggerHint} to start again.`));
    console.log();
  }

  info(message: string): void {
    this.clearLive();
    console.log(chalk.gray(`  ${message}`));
  }

  warn(message: string): void {
    this.clearLive();
    console.log(chalk.yellow(`  ⚠ ${message.split("\n").join("\n    ")}`));
  }

  error(err: Error | string): void {
    this.clearLive();
    const msg = typeof err === "string" ? err : err.message;
    console.log(chalk.red(`  ✗ ${msg.split("\n").join("\n    ")}`));
  }
}
