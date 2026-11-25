#!/usr/bin/env node
// End-to-end typing test on macOS: VibeTalk types into a fresh TextEdit document
// with real synthetic keystrokes, then the document text is read back and the
// document is closed without saving.
//
// Needs Accessibility permission for the terminal running this script.
// Usage: node test/e2e/typing-textedit-macos.mjs <audio.wav> [--typing-strategy robotjs|clipboard] [--type-mode live|phrase]
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const wav = args[0];
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const strategy = flag("--typing-strategy", "robotjs");
const typeMode = flag("--type-mode", "live");
if (!wav) {
  console.error("usage: typing-textedit-macos.mjs <audio.wav> [--typing-strategy robotjs|clipboard]");
  process.exit(2);
}

const osa = (script) => execFileSync("osascript", ["-e", script], { encoding: "utf8" }).trim();
const frontApp = () => osa('tell application "System Events" to get name of first application process whose frontmost is true');

osa('tell application "TextEdit" to make new document');
osa('tell application "TextEdit" to activate');
await new Promise((r) => setTimeout(r, 800));
if (frontApp() !== "TextEdit") {
  console.error(`TextEdit is not frontmost (${frontApp()}); aborting so nothing is typed elsewhere.`);
  process.exit(2);
}

const expected = execFileSync(process.execPath, [path.join(root, "dist/cli.js"), "transcribe", wav], { encoding: "utf8" }).trim();

const child = spawn(
  process.execPath,
  [path.join(root, "dist/cli.js"), "--input", wav, "--typing-strategy", strategy, "--type-mode", typeMode],
  { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
);
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const code = await new Promise((r) => child.on("exit", r));
const stillFront = frontApp();

const typed = osa('tell application "TextEdit" to get text of front document');
osa('tell application "TextEdit" to close front document saving no');

console.log(`exit code: ${code}, frontmost after run: ${stillFront}`);
console.log(`expected: ${JSON.stringify(expected)}`);
console.log(`typed:    ${JSON.stringify(typed)}`);
const ok = code === 0 && typed === expected;
if (!ok) console.log(out);
console.log(ok ? "E2E TYPING TEST: PASS" : "E2E TYPING TEST: FAIL");
process.exit(ok ? 0 : 1);
