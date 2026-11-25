import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Root folder for everything VibeTalk stores on disk (models, legacy files).
 * Override with VIBETALK_HOME, e.g. to keep models on another drive.
 */
export function vibetalkHome(): string {
  const override = process.env["VIBETALK_HOME"];
  return override && override.trim() ? path.resolve(override) : path.join(os.homedir(), ".vibetalk");
}

export function modelsDir(): string {
  return path.join(vibetalkHome(), "models");
}

/** Where VibeTalk <= 0.2 kept voxtral.c and its ~9 GB of weights. */
export function legacyVoxtralDir(): string {
  return path.join(vibetalkHome(), "voxtral");
}

let cachedVersion: string | null = null;

export function packageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = new URL("../../package.json", import.meta.url);
    cachedVersion = (JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string }).version;
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}

/** Total size in bytes of a directory tree (best effort, ignores errors). */
export function dirSize(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {
          // ignore
        }
      }
    }
  }
  return total;
}
