import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

process.env["VIBETALK_HOME"] = fs.mkdtempSync(path.join(os.tmpdir(), "vibetalk-test-"));

const { downloadModel, isInstalled, modelDir, removeModel } = await import("../src/engine/ModelManager.js");
type Spec = import("../src/engine/registry.js").ModelSpec;

const blobs: Record<string, Buffer> = {
  "encoder.onnx": Buffer.alloc(300_000, 7),
  "decoder.onnx": Buffer.from("decoder-bytes"),
  "joiner.onnx": Buffer.from("joiner-bytes"),
  "tokens.txt": Buffer.from("a 0\nb 1\n"),
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const file = (name: string, override?: Partial<{ size: number; sha256: string }>) => ({
  name,
  size: blobs[name]!.length,
  sha256: sha(blobs[name]!),
  ...override,
});

let server: http.Server;
let requests: Array<{ url: string; range?: string }> = [];

before(async () => {
  server = http.createServer((req, res) => {
    requests.push({ url: req.url!, range: req.headers.range });
    const name = req.url!.split("/").pop()!;
    const body = blobs[name];
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? "");
    if (m) {
      const start = Number(m[1]);
      res.writeHead(206, { "Content-Length": body.length - start }).end(body.subarray(start));
    } else {
      res.writeHead(200, { "Content-Length": body.length }).end(body);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env["HF_ENDPOINT"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function spec(id: string, files?: Partial<Spec["files"]>): Spec {
  return {
    id,
    name: id,
    summary: "",
    languages: ["en"],
    multilingual: false,
    featureDim: 80,
    numThreads: 1,
    repo: "test/repo",
    revision: "0123456789012345678901234567890123456789",
    files: {
      encoder: file("encoder.onnx"),
      decoder: file("decoder.onnx"),
      joiner: file("joiner.onnx"),
      tokens: file("tokens.txt"),
      ...files,
    },
    license: "test",
    licenseUrl: "",
    ramMB: 1,
  };
}

test("downloads, verifies and marks a model installed", async () => {
  const s = spec("fake-a");
  assert.equal(isInstalled(s), false);
  requests = [];
  const progress: number[] = [];
  await downloadModel(s, (p) => progress.push(p.received));
  assert.equal(isInstalled(s), true);
  assert.equal(requests.length, 4);
  assert.match(requests[0]!.url, /^\/test\/repo\/resolve\/0123456789012345678901234567890123456789\/encoder\.onnx$/);
  assert.equal(progress.at(-1), Object.values(blobs).reduce((n, b) => n + b.length, 0));
  assert.deepEqual(fs.readFileSync(path.join(modelDir(s), "encoder.onnx")), blobs["encoder.onnx"]);
  assert.deepEqual(
    fs.readdirSync(modelDir(s)).filter((f) => f.endsWith(".partial")),
    [],
  );

  // Second call is a no-op on the network.
  requests = [];
  await downloadModel(s);
  assert.equal(requests.length, 0);
});

test("resumes an interrupted download with a Range request", async () => {
  const s = spec("fake-b");
  fs.mkdirSync(modelDir(s), { recursive: true });
  fs.writeFileSync(path.join(modelDir(s), "encoder.onnx.partial"), blobs["encoder.onnx"]!.subarray(0, 120_000));
  requests = [];
  await downloadModel(s);
  assert.equal(isInstalled(s), true);
  assert.equal(requests.find((r) => r.url.endsWith("encoder.onnx"))?.range, "bytes=120000-");
  assert.deepEqual(fs.readFileSync(path.join(modelDir(s), "encoder.onnx")), blobs["encoder.onnx"]);
});

test("a checksum mismatch fails loudly and leaves nothing half-installed", async () => {
  const s = spec("fake-c", { decoder: file("decoder.onnx", { sha256: "0".repeat(64) }) });
  await assert.rejects(downloadModel(s), /Checksum mismatch for decoder\.onnx/);
  assert.equal(isInstalled(s), false);
  assert.equal(fs.existsSync(path.join(modelDir(s), "decoder.onnx")), false);
  assert.equal(fs.existsSync(path.join(modelDir(s), "decoder.onnx.partial")), false);
});

test("a damaged file is detected and repaired", async () => {
  const s = spec("fake-d");
  await downloadModel(s);
  fs.writeFileSync(path.join(modelDir(s), "joiner.onnx"), "truncated");
  assert.equal(isInstalled(s), false);
  requests = [];
  await downloadModel(s);
  assert.equal(isInstalled(s), true);
  assert.deepEqual(requests.map((r) => r.url.split("/").pop()), ["joiner.onnx"]);
});

test("HTTP errors surface as model errors; remove deletes the folder", async () => {
  const s = spec("fake-e", { tokens: { name: "missing.txt", size: 3, sha256: "0".repeat(64) } });
  await assert.rejects(downloadModel(s), /HTTP 404/);
  assert.equal(removeModel(s), true);
  assert.equal(fs.existsSync(modelDir(s)), false);
  assert.equal(removeModel(s), false);
});
