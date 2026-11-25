import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ModelError, errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { modelsDir } from "../utils/paths.js";
import { modelDownloadSize, modelFiles, type ModelFile, type ModelSpec } from "./registry.js";

const SENTINEL = ".complete.json";

export interface DownloadProgress {
  file: string;
  /** Bytes done across all files of the model. */
  received: number;
  total: number;
  bytesPerSecond: number;
}

export function modelDir(spec: ModelSpec): string {
  return path.join(modelsDir(), spec.id);
}

export function modelPaths(spec: ModelSpec) {
  const dir = modelDir(spec);
  return {
    encoder: path.join(dir, spec.files.encoder.name),
    decoder: path.join(dir, spec.files.decoder.name),
    joiner: path.join(dir, spec.files.joiner.name),
    tokens: path.join(dir, spec.files.tokens.name),
  };
}

/** Base URL for model downloads. Honors HF_ENDPOINT (e.g. a Hugging Face mirror). */
function hubEndpoint(): string {
  return (process.env["HF_ENDPOINT"] || "https://huggingface.co").replace(/\/+$/, "");
}

export function fileUrl(spec: ModelSpec, file: ModelFile): string {
  return `${hubEndpoint()}/${spec.repo}/resolve/${spec.revision}/${file.name}`;
}

/** Installed = sentinel for this exact revision present and every file has the expected size. */
export function isInstalled(spec: ModelSpec): boolean {
  const dir = modelDir(spec);
  try {
    const sentinel = JSON.parse(fs.readFileSync(path.join(dir, SENTINEL), "utf8")) as { revision?: string };
    if (sentinel.revision !== spec.revision) return false;
    return modelFiles(spec).every((f) => {
      try {
        return fs.statSync(path.join(dir, f.name)).size === f.size;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function hashPrefix(file: string, hash: ReturnType<typeof createHash>): Promise<void> {
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
}

/**
 * Download one file to `<dest>.partial`, resuming if a partial file exists,
 * verify size + SHA-256, then atomically rename into place.
 */
async function downloadFile(
  url: string,
  file: ModelFile,
  dest: string,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const partial = `${dest}.partial`;
  let offset = 0;
  try {
    offset = fs.statSync(partial).size;
    if (offset > file.size) {
      fs.rmSync(partial);
      offset = 0;
    }
  } catch {
    offset = 0;
  }

  const hash = createHash("sha256");
  if (offset > 0) {
    await hashPrefix(partial, hash);
    onBytes(offset);
  }

  if (offset < file.size) {
    const headers: Record<string, string> = { "User-Agent": "vibetalk-cli" };
    if (offset > 0) headers["Range"] = `bytes=${offset}-`;
    const res = await fetch(url, { headers, redirect: "follow", signal });
    if (offset > 0 && res.status === 200) {
      // Server ignored the Range request: start over.
      logger.debug(`Range not honoured for ${file.name}; restarting download`);
      await res.body?.cancel();
      fs.rmSync(partial, { force: true });
      onBytes(-offset);
      return downloadFile(url, file, dest, onBytes, signal);
    }
    if (!res.ok || !res.body) {
      throw new ModelError(`Download failed for ${file.name}: HTTP ${res.status} ${res.statusText} (${url})`);
    }
    const out = fs.createWriteStream(partial, { flags: offset > 0 ? "a" : "w" });
    const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        onBytes(chunk.length);
        callback(null, chunk);
      },
    });
    await pipeline(body, meter, out);
  }

  const size = fs.statSync(partial).size;
  if (size !== file.size) {
    throw new ModelError(`Download of ${file.name} is incomplete (${size} of ${file.size} bytes). Run the command again to resume.`);
  }
  const digest = hash.digest("hex");
  if (digest !== file.sha256) {
    fs.rmSync(partial, { force: true });
    throw new ModelError(`Checksum mismatch for ${file.name} (expected ${file.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…). The corrupt file was deleted; run the command again.`);
  }
  fs.renameSync(partial, dest);
}

/** Download (or resume / repair) every file of a model, then mark it complete. */
export async function downloadModel(
  spec: ModelSpec,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const dir = modelDir(spec);
  fs.mkdirSync(dir, { recursive: true });
  const total = modelDownloadSize(spec);
  let received = 0;
  const started = Date.now();
  let lastReport = 0;

  for (const file of modelFiles(spec)) {
    const dest = path.join(dir, file.name);
    // Keep an existing file only if it is byte-identical to the pinned one.
    if (fs.existsSync(dest)) {
      if (fs.statSync(dest).size === file.size && (await sha256OfFile(dest)) === file.sha256) {
        received += file.size;
        continue;
      }
      fs.rmSync(dest, { force: true });
    }
    try {
      await downloadFile(
        fileUrl(spec, file),
        file,
        dest,
        (n) => {
          received += n;
          const now = Date.now();
          if (onProgress && (now - lastReport > 100 || received >= total)) {
            lastReport = now;
            const elapsed = Math.max((now - started) / 1000, 0.001);
            onProgress({ file: file.name, received, total, bytesPerSecond: received / elapsed });
          }
        },
        signal,
      );
    } catch (err) {
      if (err instanceof ModelError) throw err;
      throw new ModelError(`Could not download ${file.name}: ${errorMessage(err)}\nCheck your internet connection and run the command again — downloads resume where they stopped.`);
    }
  }

  fs.writeFileSync(
    path.join(dir, SENTINEL),
    JSON.stringify({ id: spec.id, repo: spec.repo, revision: spec.revision, installedAt: new Date().toISOString() }, null, 2),
  );
}

export function removeModel(spec: ModelSpec): boolean {
  const dir = modelDir(spec);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
