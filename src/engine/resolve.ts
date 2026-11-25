import chalk from "chalk";
import * as ConfigManager from "../config/ConfigManager.js";
import { downloadProgressPrinter } from "../ui/progress.js";
import { ConfigError, ModelError } from "../utils/errors.js";
import { formatBytes } from "../utils/format.js";
import { modelsDir } from "../utils/paths.js";
import { downloadModel, isInstalled } from "./ModelManager.js";
import {
  allLanguages,
  autoSelectModel,
  baseLanguage,
  getModel,
  MODELS,
  modelDownloadSize,
  supportsLanguage,
  type ModelSpec,
} from "./registry.js";

export interface Resolved {
  spec: ModelSpec;
  language: string;
}

/** Pick the model + language from CLI flags, falling back to saved config. */
export function resolveModel(modelFlag?: string, languageFlag?: string): Resolved {
  const language = (languageFlag ?? ConfigManager.get("language")).trim();
  const base = baseLanguage(language);
  if (base !== "auto" && !allLanguages().includes(base)) {
    throw new ConfigError(`Unsupported language "${language}". Supported: auto, ${allLanguages().join(", ")}`);
  }
  const modelId = (modelFlag ?? ConfigManager.get("model")).trim();

  let spec: ModelSpec | undefined;
  if (modelId === "auto") {
    spec = autoSelectModel(language);
    if (!spec) throw new ConfigError(`No model supports language "${language}".`);
  } else {
    spec = getModel(modelId);
    if (!spec) {
      throw new ConfigError(`Unknown model "${modelId}". Available: ${MODELS.map((m) => m.id).join(", ")} (see: vibetalk models)`);
    }
  }

  const singleLanguageAuto = base === "auto" && !spec.multilingual;
  if (!singleLanguageAuto && !supportsLanguage(spec, language)) {
    const alt = autoSelectModel(language);
    throw new ConfigError(
      `Model "${spec.id}" does not support "${language}" (it supports: ${spec.languages.join(", ")}).` +
        (alt ? ` Try: --model ${alt.id}` : ""),
    );
  }
  return { spec, language: singleLanguageAuto ? spec.languages[0]! : language };
}

/** Download the model on first use, with a progress bar. */
export async function ensureModelInstalled(spec: ModelSpec): Promise<void> {
  if (isInstalled(spec)) return;
  console.log();
  console.log(`  ${chalk.bold(`Downloading ${spec.name}`)} ${chalk.gray(`(${formatBytes(modelDownloadSize(spec))}, one-time)`)}`);
  console.log(chalk.gray(`  → ${modelsDir()}/${spec.id}`));
  console.log(chalk.gray(`  License: ${spec.license}`));
  const progress = downloadProgressPrinter();
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once("SIGINT", onSigint);
  try {
    await downloadModel(spec, progress.update, controller.signal);
  } catch (err) {
    progress.done();
    if (controller.signal.aborted) throw new ModelError("Download cancelled. Run again to resume.");
    throw err;
  } finally {
    process.off("SIGINT", onSigint);
  }
  progress.done();
  console.log(`  ${chalk.green("✓")} Model ready.`);
}
