#!/usr/bin/env node
// End-to-end microphone test on macOS using the BlackHole virtual audio device.
//
// It runs the real CLI (PvRecorder mic capture → streaming model → committer),
// toggles recording with Enter like a user would, "speaks" into BlackHole with
// the macOS `say` command, and checks what VibeTalk would have typed.
//
// Requirements: macOS, `brew install blackhole-2ch`, microphone permission for
// the terminal, and a built CLI (npm run build).
//
// Usage: node test/e2e/mic-loopback-macos.mjs [--model kroko-en] [--typing-strategy none]
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const model = flag("--model", "kroko-en");
const strategy = flag("--typing-strategy", "none");
const language = flag("--language", undefined);
const typeMode = flag("--type-mode", undefined);
// --pty: run under a pseudo-terminal like a real user (Enter comes from a TTY,
// the live line is rendered, and stopping with Enter must not type the tail).
const pty = args.includes("--pty");
// [[slnc N]] makes `say` pause for N ms — phrase mode must type at that pause.
const phrases = [
  "Please refactor the login function so it returns a promise instead of using callbacks.",
  "Add a unit test. [[slnc 1500]] It should check that the parser handles empty strings.",
];
const spoken = (p) => p.replace(/\[\[[^\]]*\]\]/g, " ");

const devices = execFileSync(process.execPath, [path.join(root, "dist/cli.js"), "devices"], { encoding: "utf8" });
const match = devices.match(/\[(\d+)\] BlackHole/);
if (!match) {
  console.error("BlackHole input device not found. Install it with: brew install blackhole-2ch");
  process.exit(2);
}
const device = match[1];

const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vibetalk-e2e-")), "typed.log");
fs.writeFileSync(log, "");
const cliArgs = [path.join(root, "dist/cli.js"), "--device", device, "--model", model, "--typing-strategy", strategy, "--verbose"];
if (language) cliArgs.push("--language", language);
if (typeMode) cliArgs.push("--type-mode", typeMode);
const ptyWrapper = "import pty, sys; sys.exit(pty.spawn(sys.argv[1:]) >> 8)";
const [cmd, cmdArgs] = pty ? ["python3", ["-c", ptyWrapper, process.execPath, ...cliArgs]] : [process.execPath, cliArgs];
const child = spawn(cmd, cmdArgs, {
  env: { ...process.env, VIBETALK_TYPED_LOG: log, FORCE_COLOR: "0" },
  stdio: ["pipe", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(re, ms = 60000) {
  const start = Date.now();
  while (!re.test(out)) {
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${re}\n--- output ---\n${out}`);
    if (child.exitCode !== null) throw new Error(`CLI exited early (${child.exitCode})\n${out}`);
    await sleep(50);
  }
}
const say = (text) => execFileSync("say", ["-a", "BlackHole 2ch", "-r", "180", text]);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
function wer(ref, hyp) {
  const r = norm(ref).split(" ");
  const h = norm(hyp).split(" ").filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

let failed = false;
try {
  await waitFor(/start \/ stop/);
  for (const [i, phrase] of phrases.entries()) {
    const before = fs.readFileSync(log, "utf8").length;
    child.stdin.write("\n");
    await waitFor(new RegExp(`(Listening[\\s\\S]*){${i + 1}}`));
    const t0 = Date.now();
    say(phrase);
    const spokenAt = Date.now();
    // Live typing: some words must already be typed before the speaker finishes.
    const typedWhileSpeaking = fs.readFileSync(log, "utf8").slice(before);
    // A user pauses, then switches back to the terminal: by then the whole
    // phrase must already be typed (live mode commits the last word at a pause).
    await sleep(2000);
    const typedBeforeStop = fs.readFileSync(log, "utf8").slice(before);
    child.stdin.write("\n");
    await waitFor(new RegExp(`(Stopped[\\s\\S]*){${i + 1}}`));
    const typed = fs.readFileSync(log, "utf8").slice(before);
    const e = wer(spoken(phrase), typed);
    console.log(`phrase ${i + 1}: spoke ${((spokenAt - t0) / 1000).toFixed(1)}s, WER ${(e * 100).toFixed(1)}%`);
    const eBefore = wer(spoken(phrase), typedBeforeStop);
    console.log(`  typed while speaking: ${JSON.stringify(typedWhileSpeaking)}`);
    console.log(`  typed before stop:    ${JSON.stringify(typedBeforeStop)} (WER ${(eBefore * 100).toFixed(1)}%)`);
    console.log(`  typed total:          ${JSON.stringify(typed)}`);
    if (e > 0.15 || eBefore > 0.15) failed = true;
  }
  if (/pure silence/.test(out)) {
    console.log("Microphone delivered silence — check microphone permission for this terminal.");
    failed = true;
  }
  if (/Not typed/.test(out)) console.log(`  warning shown: ${out.match(/Not typed[^\n]*/)[0]}`);
  if (pty) child.stdin.write("\x04"); // Ctrl+D in the terminal → quit
  else child.stdin.end(); // stdin closed → quit
  await new Promise((r) => child.on("exit", r));
  console.log(`exit code ${child.exitCode}`);
  if (child.exitCode !== 0) failed = true;
} catch (err) {
  console.error(String(err));
  failed = true;
  child.kill("SIGKILL");
}
if (failed) console.log(out.split("\n").filter((l) => /✓|⚠|✗|Transcript revised/.test(l)).join("\n"));
console.log(failed ? "E2E MIC TEST: FAIL" : "E2E MIC TEST: PASS");
process.exit(failed ? 1 : 0);
