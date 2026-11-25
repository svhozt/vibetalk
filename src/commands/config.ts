import * as ConfigManager from "../config/ConfigManager.js";
import { CONFIG_KEYS } from "../config/types.js";

export async function configSetCommand(key: string, value: string): Promise<void> {
  const [k, v] = ConfigManager.setFromCli(key, value);
  console.log(`  ${k} = ${JSON.stringify(v)}`);
}

export async function configGetCommand(key: string): Promise<void> {
  const k = ConfigManager.resolveKey(key);
  console.log(JSON.stringify(ConfigManager.get(k)));
}

export async function configListCommand(): Promise<void> {
  const config = ConfigManager.getAll();
  console.log(`\n  Config file: ${ConfigManager.getConfigPath()}\n`);
  for (const key of CONFIG_KEYS) {
    const source = ConfigManager.valueSource(key);
    const note = source === "default" ? "  (default)" : source === "invalid" ? "  (default — saved value from an older version is ignored)" : "";
    console.log(`  ${key.padEnd(15)} ${JSON.stringify(config[key])}${note}`);
  }
  console.log();
}

export async function configResetCommand(): Promise<void> {
  ConfigManager.reset();
  console.log("  Configuration reset to defaults.");
}
