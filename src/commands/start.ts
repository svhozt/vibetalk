import fs from "node:fs";
import chalk from "chalk";
import { FileSource, decodeAudioFile } from "../audio/FileSource.js";
import { MicSource } from "../audio/MicSource.js";
import type { AudioSource } from "../audio/types.js";
import * as ConfigManager from "../config/ConfigManager.js";
import { Pipeline } from "../core/Pipeline.js";
import { SessionManager } from "../core/SessionManager.js";
import type { TypeMode } from "../core/TextCommitter.js";
import { Recognizer } from "../engine/Recognizer.js";
import { ensureModelInstalled, resolveModel } from "../engine/resolve.js";
import { GlobalHotkey } from "../hotkey/GlobalHotkey.js";
import { TerminalToggle } from "../hotkey/TerminalToggle.js";
import type { IHotkeyListener } from "../hotkey/types.js";
import { createTyper } from "../typing/TypingFactory.js";
import { TYPING_STRATEGIES, type TypingStrategy } from "../typing/types.js";
import { TerminalUI } from "../ui/TerminalUI.js";
import { ConfigError } from "../utils/errors.js";
import { formatBytes } from "../utils/format.js";
import * as logger from "../utils/logger.js";
import { dirSize, legacyVoxtralDir } from "../utils/paths.js";
import { accessibilityInstructions, isMac } from "../utils/platform.js";

export interface StartOptions {
  model?: string;
  language?: string;
  device?: string;
  hotkey?: string | boolean;
  typingStrategy?: string;
  typeMode?: string;
  typingDelay?: string;
  threads?: string;
  verbose?: boolean;
  /** Testing: play this audio file instead of the microphone, start immediately, exit when it ends. */
  input?: string;
}

function intOption(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ConfigError(`--${name} must be an integer (got "${value}")`);
  return n;
}

export async function startCommand(options: StartOptions): Promise<void> {
  if (options.verbose) logger.setVerbose(true);
  let ui = new TerminalUI();

  const { spec, language } = resolveModel(options.model, options.language);

  const typingStrategy = (options.typingStrategy ?? ConfigManager.get("typingStrategy")) as TypingStrategy;
  if (!TYPING_STRATEGIES.includes(typingStrategy)) {
    throw new ConfigError(`--typing-strategy must be one of: ${TYPING_STRATEGIES.join(", ")}`);
  }
  const typeMode = (options.typeMode ?? ConfigManager.get("typeMode")) as TypeMode;
  if (typeMode !== "live" && typeMode !== "phrase") throw new ConfigError(`--type-mode must be "live" or "phrase"`);
  const typingDelay = intOption("typing-delay", options.typingDelay) ?? ConfigManager.get("typingDelayMs");
  const deviceIndex = intOption("device", options.device) ?? ConfigManager.get("deviceIndex");
  const numThreads = intOption("threads", options.threads) ?? ConfigManager.get("numThreads");
  const hotkeyCombo = typeof options.hotkey === "string" ? options.hotkey : options.hotkey ? ConfigManager.get("hotkey") : null;

  // Prepare the input file first so a bad path fails before any download.
  const inputSamples = options.input ? decodeAudioFile(options.input) : null;

  await ensureModelInstalled(spec);

  const legacy = legacyVoxtralDir();
  if (fs.existsSync(legacy)) {
    ui.info(
      chalk.yellow(`Found ${formatBytes(dirSize(legacy))} of old Voxtral files from VibeTalk 0.2 at ${legacy}.`) +
        chalk.gray(" Free the space with: vibetalk cleanup"),
    );
  }

  const typer = await createTyper(typingStrategy, typingDelay);
  ui = new TerminalUI(typer.name !== "none");
  const recognizer = new Recognizer(spec, { language, numThreads });

  const createSource = (): AudioSource =>
    inputSamples ? new FileSource(inputSamples, options.input!, true) : new MicSource(deviceIndex);

  const pipeline = new Pipeline(recognizer, typer, { typeMode, createSource });

  const listeners: IHotkeyListener[] = [];
  if (!options.input) listeners.push(new TerminalToggle());
  if (hotkeyCombo) listeners.push(new GlobalHotkey(hotkeyCombo));
  const session = new SessionManager(pipeline, listeners);

  pipeline.on("state", (s) => ui.onState(s));
  pipeline.on("transcript", (u) => ui.onTranscript(u));
  pipeline.on("sessionEnd", (stats) => {
    ui.onSessionEnd(stats);
    logger.debug(`Session RTF ${stats.realTimeFactor.toFixed(3)} over ${stats.audioSeconds.toFixed(1)}s of audio`);
  });
  pipeline.on("warning", (m: string) => ui.warn(m));
  pipeline.on("error", (e: Error) => ui.error(e));
  session.on("error", (e: Error) => ui.error(e));

  const failures = await session.initialize();

  const langLabel = spec.multilingual && !recognizer.language ? "auto-detect" : language;
  const modeLabel = pipeline.typeMode === "live" ? "live (words appear as you speak)" : "phrase (text appears at each pause)";
  ui.showHeader({
    model: `${spec.name} ${chalk.gray(`(${spec.id}, loaded in ${Math.round(recognizer.loadMs)} ms)`)}`,
    language: langLabel,
    input: options.input ? `file ${options.input}` : deviceIndex >= 0 ? `device #${deviceIndex}` : "default microphone",
    typing: typer.name === "none" ? "off (transcript only)" : `${typer.name}, ${modeLabel}`,
    triggers: options.input ? ["(file input)"] : session.activeTriggers,
  });
  for (const f of failures) ui.warn(`${f.message}\nUse Enter in this terminal to start/stop instead.`);

  if (isMac() && typer.name !== "none") {
    ui.info(chalk.gray(`If nothing gets typed: ${accessibilityInstructions().split("\n")[1]!.trim()}`));
    console.log();
  }

  if (options.input) {
    pipeline.on("sourceEnded", () => void session.shutdown(0, { typeTail: true }));
    await session.toggle();
  }
}
