// Runs the real speech models. Opt-in (downloads up to ~1 GB):
//   VIBETALK_MODEL_TESTS=1 npm test
// Uses macOS `say` to synthesise speech, so it is skipped elsewhere.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const enabled = process.env["VIBETALK_MODEL_TESTS"] === "1" && process.platform === "darwin";
const skip = enabled ? false : "set VIBETALK_MODEL_TESTS=1 on macOS to run real-model tests";

const cases: Array<{ model: string; voice: string; language?: string; text: string }> = [
  { model: "kroko-en", voice: "Samantha", text: "Please refactor the login function so it returns a promise instead of using callbacks." },
  { model: "kroko-de", voice: "Anna", text: "Bitte schreibe eine Funktion, die alle Benutzer aus der Datenbank lädt." },
  { model: "nemotron", voice: "Samantha", text: "The quick brown fox jumps over the lazy dog while the band plays jazz in the park." },
  { model: "nemotron", voice: "Anna", language: "auto", text: "Bitte schreibe eine Funktion, die alle Benutzer aus der Datenbank lädt." },
];

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
function wer(ref: string, hyp: string): number {
  const r = norm(ref).split(" ");
  const h = norm(hyp).split(" ").filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array<number>(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0]![j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length]![h.length]! / r.length;
}

test("real models transcribe synthetic speech", { skip, timeout: 30 * 60_000 }, async (t) => {
  const { downloadModel, isInstalled } = await import("../src/engine/ModelManager.js");
  const { getModel } = await import("../src/engine/registry.js");
  const { Recognizer } = await import("../src/engine/Recognizer.js");
  const { decodeAudioFile } = await import("../src/audio/FileSource.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibetalk-audio-"));

  for (const c of cases) {
    await t.test(`${c.model}${c.language ? ` (${c.language})` : ""}: ${c.text.slice(0, 32)}…`, async () => {
      const spec = getModel(c.model)!;
      if (!isInstalled(spec)) await downloadModel(spec);
      const wav = path.join(dir, `${c.model}-${c.voice}.wav`);
      const aiff = wav.replace(/\.wav$/, ".aiff");
      execFileSync("say", ["-v", c.voice, "-o", aiff, c.text]);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", aiff, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
      const samples = decodeAudioFile(wav);
      const session = new Recognizer(spec, { language: c.language }).createSession();
      let prev = "";
      for (let o = 0; o < samples.length; o += 512) {
        const text = session.accept(samples.subarray(o, o + 512));
        assert.ok(text.startsWith(prev), `transcript must only grow: ${JSON.stringify(prev)} → ${JSON.stringify(text)}`);
        prev = text;
      }
      const text = session.finish();
      const e = wer(c.text, text);
      assert.ok(e <= 0.15, `WER ${(e * 100).toFixed(1)}% too high: ${JSON.stringify(text)}`);
    });
  }
});
