import fs from "node:fs";
import * as readline from "node:readline/promises";
import chalk from "chalk";
import { formatBytes } from "../utils/format.js";
import { dirSize, legacyVoxtralDir } from "../utils/paths.js";

/** Remove the voxtral.c build + ~9 GB of weights left behind by VibeTalk 0.2.x. */
export async function cleanupCommand(options: { yes?: boolean }): Promise<void> {
  const dir = legacyVoxtralDir();
  if (!fs.existsSync(dir)) {
    console.log("  Nothing to clean up — no legacy Voxtral files found.");
    return;
  }
  const size = formatBytes(dirSize(dir));
  console.log(`  Legacy Voxtral engine from VibeTalk 0.2: ${chalk.bold(dir)} (${size})`);
  console.log(chalk.gray("  VibeTalk 1.x no longer uses it."));

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.log("  Re-run with --yes to delete it.");
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  Delete it and free ${size}? [y/N] `)).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("  Kept.");
      return;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`  ${chalk.green("✓")} Deleted ${dir} — freed ${size}.`);
}
