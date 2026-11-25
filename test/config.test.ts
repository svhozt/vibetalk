import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibetalk-test-"));
process.env["VIBETALK_HOME"] = home;
// A config file as left behind by VibeTalk 0.2 (cloud-era keys + stale model name).
fs.writeFileSync(
  path.join(home, "config.json"),
  JSON.stringify({
    apiKey: "not-a-real-key",
    model: "stt-rt-preview",
    hotkey: "ctrl+shift+v",
    typingStrategy: "auto",
    typingDelayMs: 12,
    deviceIndex: -1,
    language: "en",
    enableEndpointDetection: true,
    maxEndpointDelayMs: 500,
  }),
);

const ConfigManager = await import("../src/config/ConfigManager.js");

test("legacy config: valid values are kept, invalid ones fall back to defaults", () => {
  assert.equal(ConfigManager.get("model"), "auto");
  assert.equal(ConfigManager.valueSource("model"), "invalid");
  assert.equal(ConfigManager.get("hotkey"), "ctrl+shift+v");
  assert.equal(ConfigManager.get("typingDelayMs"), 12);
  assert.equal(ConfigManager.get("language"), "en");
  assert.equal(ConfigManager.get("typeMode"), "live");
  assert.equal(ConfigManager.valueSource("typeMode"), "default");
  assert.ok(!("apiKey" in ConfigManager.getAll()), "unknown legacy keys are never surfaced");
});

test("setFromCli validates and coerces", () => {
  assert.deepEqual(ConfigManager.setFromCli("typing-delay", "20"), ["typingDelayMs", 20]);
  assert.deepEqual(ConfigManager.setFromCli("device", "-1"), ["deviceIndex", -1]);
  assert.deepEqual(ConfigManager.setFromCli("model", "nemotron"), ["model", "nemotron"]);
  assert.deepEqual(ConfigManager.setFromCli("lang", "de"), ["language", "de"]);
  assert.deepEqual(ConfigManager.setFromCli("mode", "phrase"), ["typeMode", "phrase"]);
  assert.throws(() => ConfigManager.setFromCli("typing-delay", "abc"), /integer/);
  assert.throws(() => ConfigManager.setFromCli("typing-delay", "1.5"), /integer/);
  assert.throws(() => ConfigManager.setFromCli("model", "whisper"), /Unknown model/);
  assert.throws(() => ConfigManager.setFromCli("language", "xx"), /Unsupported language/);
  assert.throws(() => ConfigManager.setFromCli("typing-strategy", "magic"), /typingStrategy/);
  assert.throws(() => ConfigManager.setFromCli("apiKey", "x"), /Unknown config key/);
});

test("reset leaves an empty file so future defaults apply", () => {
  ConfigManager.reset();
  const stored = JSON.parse(fs.readFileSync(ConfigManager.getConfigPath(), "utf8"));
  assert.deepEqual(stored, {});
  assert.equal(ConfigManager.get("language"), "auto");
});
