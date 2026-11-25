#!/usr/bin/env node
import { Command, Option } from "commander";
import chalk from "chalk";
import { cleanupCommand } from "./commands/cleanup.js";
import { configGetCommand, configListCommand, configResetCommand, configSetCommand } from "./commands/config.js";
import { devicesCommand } from "./commands/devices.js";
import { modelsDownloadCommand, modelsListCommand, modelsRemoveCommand } from "./commands/models.js";
import { startCommand } from "./commands/start.js";
import { transcribeCommand } from "./commands/transcribe.js";
import { VibeTalkError } from "./utils/errors.js";
import { isVerbose } from "./utils/logger.js";
import { packageVersion } from "./utils/paths.js";

/** Wrap a command so user-facing errors print cleanly instead of as stack traces. */
function run<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof VibeTalkError) {
        console.error(chalk.red(`\n  ✗ ${err.message.split("\n").join("\n    ")}\n`));
      } else {
        console.error(chalk.red(`\n  ✗ Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`));
        if (isVerbose() && err instanceof Error) console.error(err.stack);
      }
      process.exit(1);
    }
  };
}

const program = new Command();

program
  .name("vibetalk")
  .description("Real-time voice dictation — speak and it types wherever your cursor is. Runs 100% locally.")
  .version(packageVersion(), "-v, --version");

program
  .command("start", { isDefault: true })
  .description("Start dictation (default command)")
  .option("-m, --model <id>", "speech model (see `vibetalk models`), or auto")
  .option("-l, --language <code>", "language: en, de, fr, … or auto (multilingual models)")
  .option("-d, --device <index>", "audio input device index (see `vibetalk devices`)")
  .option("--hotkey [combo]", "also toggle with a global hotkey (default: ctrl+shift+space)")
  .option("--type-mode <mode>", "live = type words as you speak, phrase = type at each pause")
  .option("--typing-strategy <strategy>", "auto | robotjs | clipboard | none (transcript only)")
  .option("--typing-delay <ms>", "delay between typed characters")
  .option("--threads <n>", "CPU threads for recognition (default: per model)")
  .option("--verbose", "debug logging")
  .addOption(new Option("--input <file>", "read audio from a file instead of the microphone (testing)").hideHelp())
  .action(run(startCommand));

program
  .command("transcribe <file>")
  .description("Transcribe an audio file (WAV; other formats need ffmpeg)")
  .option("-m, --model <id>", "speech model, or auto")
  .option("-l, --language <code>", "language code or auto")
  .option("--threads <n>", "CPU threads")
  .option("--json", "print a JSON result with timing")
  .option("--verbose", "debug logging")
  .action(run(transcribeCommand));

const models = program.command("models").description("List, download or remove speech models");
models.command("list", { isDefault: true }).description("List available models").action(run(modelsListCommand));
models.command("download <id>").description("Download a model ahead of time").action(run(modelsDownloadCommand));
models.command("remove <id>").description("Delete a downloaded model").action(run(modelsRemoveCommand));

program.command("devices").description("List audio input devices").action(run(devicesCommand));

const config = program.command("config").description("View or change saved settings");
config.command("list", { isDefault: true }).description("Show all settings").action(run(configListCommand));
config
  .command("set <key> <value>")
  .description("Set a value, e.g. `vibetalk config set model nemotron`")
  .action(run(configSetCommand));
config.command("get <key>").description("Print one value").action(run(configGetCommand));
config.command("reset").description("Reset all settings to defaults").action(run(configResetCommand));

program
  .command("cleanup")
  .description("Delete the old Voxtral engine files left by VibeTalk 0.2 (~9 GB)")
  .option("-y, --yes", "don't ask for confirmation")
  .action(run(cleanupCommand));

await program.parseAsync();
