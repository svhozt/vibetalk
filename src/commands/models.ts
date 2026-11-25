import chalk from "chalk";
import * as ConfigManager from "../config/ConfigManager.js";
import { downloadModel, isInstalled, modelDir, removeModel } from "../engine/ModelManager.js";
import { autoSelectModel, getModel, MODELS, modelDownloadSize, type ModelSpec } from "../engine/registry.js";
import { downloadProgressPrinter } from "../ui/progress.js";
import { ConfigError } from "../utils/errors.js";
import { formatBytes } from "../utils/format.js";
import { modelsDir } from "../utils/paths.js";

function requireModel(id: string): ModelSpec {
  const spec = getModel(id);
  if (!spec) throw new ConfigError(`Unknown model "${id}". Available: ${MODELS.map((m) => m.id).join(", ")}`);
  return spec;
}

export async function modelsListCommand(): Promise<void> {
  const configured = ConfigManager.get("model");
  const active = configured === "auto" ? autoSelectModel(ConfigManager.get("language"))?.id : configured;
  console.log();
  console.log(chalk.bold("  Streaming speech models") + chalk.gray(`  (stored in ${modelsDir()})`));
  console.log();
  for (const m of MODELS) {
    const installed = isInstalled(m);
    const mark = installed ? chalk.green("●") : chalk.gray("○");
    const tag = m.id === active ? chalk.cyan(" ← active") : "";
    const langs = m.multilingual ? `${m.languages.length} languages + auto-detect` : m.languages.join(", ");
    console.log(`  ${mark} ${chalk.bold(m.id.padEnd(10))} ${m.name}${tag}`);
    console.log(
      chalk.gray(`      ${formatBytes(modelDownloadSize(m)).padEnd(7)} download · ~${formatBytes(m.ramMB * 1024 * 1024)} RAM · ${langs}`),
    );
    console.log(chalk.gray(`      ${m.summary}`));
    console.log(chalk.gray(`      License: ${m.license}`));
  }
  console.log();
  console.log(chalk.gray("  ● installed   ○ downloads automatically on first use"));
  console.log(chalk.gray("  Use one:  vibetalk --model nemotron     Make it default:  vibetalk config set model nemotron"));
  console.log();
}

export async function modelsDownloadCommand(id: string): Promise<void> {
  const spec = requireModel(id);
  if (isInstalled(spec)) {
    console.log(`  ${chalk.green("✓")} ${spec.id} is already installed (${modelDir(spec)})`);
    return;
  }
  console.log(`  Downloading ${chalk.bold(spec.name)} ${chalk.gray(`(${formatBytes(modelDownloadSize(spec))})`)}`);
  console.log(chalk.gray(`  License: ${spec.license} — ${spec.licenseUrl}`));
  const progress = downloadProgressPrinter();
  try {
    await downloadModel(spec, progress.update);
  } finally {
    progress.done();
  }
  console.log(`  ${chalk.green("✓")} Installed to ${modelDir(spec)}`);
}

export async function modelsRemoveCommand(id: string): Promise<void> {
  const spec = requireModel(id);
  if (removeModel(spec)) console.log(`  Removed ${spec.id}.`);
  else console.log(`  ${spec.id} is not installed.`);
}
