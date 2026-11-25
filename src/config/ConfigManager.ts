import Conf from "conf";
import { allLanguages, baseLanguage, getModel, MODELS } from "../engine/registry.js";
import { TYPING_STRATEGIES, type TypingStrategy } from "../typing/types.js";
import { ConfigError } from "../utils/errors.js";
import { vibetalkHome } from "../utils/paths.js";
import { CONFIG_KEYS, type VibeTalkConfig } from "./types.js";

export const DEFAULTS: VibeTalkConfig = {
  model: "auto",
  language: "auto",
  typingStrategy: "auto",
  typeMode: "live",
  typingDelayMs: 8,
  deviceIndex: -1,
  hotkey: "ctrl+shift+space",
  numThreads: 0,
};

let store: Conf<Partial<VibeTalkConfig>> | null = null;

function getStore(): Conf<Partial<VibeTalkConfig>> {
  if (!store) {
    // VIBETALK_HOME relocates the config too (handy for tests and portable installs).
    const cwd = process.env["VIBETALK_HOME"] ? vibetalkHome() : undefined;
    // No `defaults` here on purpose: conf would write them into the file, making
    // defaults indistinguishable from user choices and impossible to update later.
    store = new Conf<Partial<VibeTalkConfig>>({ projectName: "vibetalk", ...(cwd ? { cwd } : {}) });
  }
  return store;
}

/**
 * Read a value, falling back to the default when the stored one is invalid.
 * (Config files from VibeTalk <= 0.2 contain keys from older engines, e.g. a
 * cloud model name in `model`; those are ignored, never shown, never sent anywhere.)
 */
export function get<K extends keyof VibeTalkConfig>(key: K): VibeTalkConfig[K] {
  const value = getStore().get(key);
  if (value === undefined) return DEFAULTS[key];
  try {
    return validate(key, value);
  } catch {
    return DEFAULTS[key];
  }
}

/** "default" = nothing saved, "set" = valid saved value, "invalid" = saved value ignored (e.g. from an older version). */
export function valueSource(key: keyof VibeTalkConfig): "default" | "set" | "invalid" {
  if (!getStore().has(key)) return "default";
  try {
    validate(key, getStore().get(key));
    return "set";
  } catch {
    return "invalid";
  }
}

export function getAll(): VibeTalkConfig {
  const out = {} as Record<string, unknown>;
  for (const key of CONFIG_KEYS) out[key] = get(key);
  return out as unknown as VibeTalkConfig;
}

export function set<K extends keyof VibeTalkConfig>(key: K, value: VibeTalkConfig[K]): void {
  getStore().set(key, validate(key, value));
}

export function reset(): void {
  getStore().clear();
}

export function getConfigPath(): string {
  return getStore().path;
}

const ALIASES: Record<string, keyof VibeTalkConfig> = {
  model: "model",
  language: "language",
  lang: "language",
  typingstrategy: "typingStrategy",
  typing: "typingStrategy",
  typemode: "typeMode",
  mode: "typeMode",
  typingdelayms: "typingDelayMs",
  typingdelay: "typingDelayMs",
  deviceindex: "deviceIndex",
  device: "deviceIndex",
  hotkey: "hotkey",
  numthreads: "numThreads",
  threads: "numThreads",
};

export function resolveKey(key: string): keyof VibeTalkConfig {
  const k = ALIASES[key.toLowerCase().replace(/[-_]/g, "")];
  if (!k) throw new ConfigError(`Unknown config key "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`);
  return k;
}

function parseIntStrict(key: string, value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${key} must be an integer between ${min} and ${max} (got "${String(value)}")`);
  }
  return n;
}

function validate<K extends keyof VibeTalkConfig>(key: K, value: unknown): VibeTalkConfig[K] {
  switch (key) {
    case "model": {
      const v = String(value).trim();
      if (v === "auto" || getModel(v)) return v as VibeTalkConfig[K];
      throw new ConfigError(`Unknown model "${v}". Choose one of: auto, ${MODELS.map((m) => m.id).join(", ")}`);
    }
    case "language": {
      const v = String(value).trim();
      const base = baseLanguage(v);
      if (base === "auto" || allLanguages().includes(base)) return v as VibeTalkConfig[K];
      throw new ConfigError(`Unsupported language "${v}". Supported: auto, ${allLanguages().join(", ")}`);
    }
    case "typingStrategy": {
      const v = String(value).trim() as TypingStrategy;
      if (TYPING_STRATEGIES.includes(v)) return v as VibeTalkConfig[K];
      throw new ConfigError(`typingStrategy must be one of: ${TYPING_STRATEGIES.join(", ")}`);
    }
    case "typeMode": {
      const v = String(value).trim();
      if (v === "live" || v === "phrase") return v as VibeTalkConfig[K];
      throw new ConfigError(`typeMode must be "live" (type words as you speak) or "phrase" (type at each pause)`);
    }
    case "typingDelayMs":
      return parseIntStrict(key, value, 0, 1000) as VibeTalkConfig[K];
    case "deviceIndex":
      return parseIntStrict(key, value, -1, 1000) as VibeTalkConfig[K];
    case "numThreads":
      return parseIntStrict(key, value, 0, 64) as VibeTalkConfig[K];
    case "hotkey": {
      const v = String(value).trim().toLowerCase();
      if (/^[a-z0-9 +]+$/.test(v) && v.length > 0) return v as VibeTalkConfig[K];
      throw new ConfigError(`Invalid hotkey "${String(value)}". Example: ctrl+shift+space`);
    }
    default:
      throw new ConfigError(`Unknown config key "${String(key)}"`);
  }
}

/** Set from CLI strings with type coercion + validation. Returns the normalised key and value. */
export function setFromCli(key: string, value: string): [keyof VibeTalkConfig, unknown] {
  const k = resolveKey(key);
  const v = validate(k, value);
  getStore().set(k, v);
  return [k, v];
}

export { validate as validateConfigValue };
