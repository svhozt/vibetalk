import chalk from "chalk";
import type { DownloadProgress } from "../engine/ModelManager.js";
import { formatBytes } from "../utils/format.js";

/** Returns a progress callback that draws a single updating line (or sparse lines when not a TTY). */
export function downloadProgressPrinter(): { update: (p: DownloadProgress) => void; done: () => void } {
  const tty = !!process.stdout.isTTY;
  let lastPct = -10;
  let drawn = false;
  return {
    update(p) {
      const pct = p.total > 0 ? Math.min(100, (p.received / p.total) * 100) : 0;
      const speed = `${formatBytes(p.bytesPerSecond)}/s`;
      const eta = p.bytesPerSecond > 0 ? Math.max(0, (p.total - p.received) / p.bytesPerSecond) : 0;
      const etaText = eta >= 1 ? ` · ${Math.ceil(eta)}s left` : "";
      if (tty) {
        const width = 24;
        const filled = Math.round((pct / 100) * width);
        const bar = chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
        process.stdout.write(
          `\r\x1b[2K  ${bar} ${pct.toFixed(0).padStart(3)}%  ${formatBytes(p.received)} / ${formatBytes(p.total)}  ${chalk.gray(speed + etaText)}`,
        );
        drawn = true;
      } else if (pct - lastPct >= 10 || pct >= 100) {
        lastPct = pct;
        console.log(`  ${pct.toFixed(0)}% (${formatBytes(p.received)} / ${formatBytes(p.total)})`);
      }
    },
    done() {
      if (tty && drawn) process.stdout.write("\n");
    },
  };
}
