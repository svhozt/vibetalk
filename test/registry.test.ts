import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Isolate config + models from the real user profile before anything reads them.
process.env["VIBETALK_HOME"] = fs.mkdtempSync(path.join(os.tmpdir(), "vibetalk-test-"));

const { autoSelectModel, baseLanguage, DEFAULT_MODEL_ID, getModel, MODELS, modelFiles, supportsLanguage } = await import(
  "../src/engine/registry.js"
);
const { resolveModel } = await import("../src/engine/resolve.js");

test("registry entries are complete and pinned", () => {
  const ids = new Set<string>();
  for (const m of MODELS) {
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    assert.match(m.revision, /^[0-9a-f]{40}$/, `${m.id} revision must be a commit sha`);
    for (const f of modelFiles(m)) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/, `${m.id}/${f.name} sha256`);
      assert.ok(f.size > 0, `${m.id}/${f.name} size`);
    }
    assert.ok(m.languages.length > 0);
    assert.ok(m.license.length > 0);
  }
  assert.ok(getModel(DEFAULT_MODEL_ID));
});

test("language normalisation", () => {
  assert.equal(baseLanguage("en-US"), "en");
  assert.equal(baseLanguage("PT_br"), "pt");
  assert.equal(baseLanguage("auto"), "auto");
  assert.equal(baseLanguage(""), "auto");
});

test("auto model selection picks the lightest model for the language", () => {
  assert.equal(autoSelectModel("auto")?.id, "kroko-en");
  assert.equal(autoSelectModel("en")?.id, "kroko-en");
  assert.equal(autoSelectModel("en-GB")?.id, "kroko-en");
  assert.equal(autoSelectModel("de")?.id, "kroko-de");
  assert.equal(autoSelectModel("fr")?.id, "kroko-fr");
  assert.equal(autoSelectModel("es")?.id, "kroko-es");
  assert.equal(autoSelectModel("ja")?.id, "nemotron");
  assert.equal(autoSelectModel("xx"), undefined);
});

test("supportsLanguage", () => {
  const kroko = getModel("kroko-en")!;
  const nemotron = getModel("nemotron")!;
  assert.equal(supportsLanguage(kroko, "en"), true);
  assert.equal(supportsLanguage(kroko, "de"), false);
  assert.equal(supportsLanguage(kroko, "auto"), false);
  assert.equal(supportsLanguage(nemotron, "auto"), true);
  assert.equal(supportsLanguage(nemotron, "uk-UA"), true);
});

test("resolveModel combines flags and defaults", () => {
  assert.deepEqual(
    (({ spec, language }) => [spec.id, language])(resolveModel(undefined, undefined)),
    ["kroko-en", "en"],
  );
  assert.equal(resolveModel(undefined, "de").spec.id, "kroko-de");
  assert.equal(resolveModel("nemotron", undefined).language, "auto");
  assert.equal(resolveModel("nemotron", "es").language, "es");
  assert.equal(resolveModel("kroko-en", "auto").language, "en");
  assert.throws(() => resolveModel("kroko-en", "de"), /does not support "de".*--model kroko-de/);
  assert.throws(() => resolveModel("nope", undefined), /Unknown model/);
  assert.throws(() => resolveModel(undefined, "klingon"), /Unsupported language/);
});
