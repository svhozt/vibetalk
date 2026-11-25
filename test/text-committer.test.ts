import assert from "node:assert/strict";
import { test } from "node:test";
import { TextCommitter } from "../src/core/TextCommitter.js";
import { cleanTranscript } from "../src/engine/Recognizer.js";

/** Feed successive transcripts and collect everything that would be typed. */
function run(mode: "live" | "phrase", steps: Array<[string, { pause?: boolean; final?: boolean }?]>) {
  const c = new TextCommitter(mode);
  c.startSession(false);
  const deltas = steps.map(([text, opts]) => c.update(text, opts ?? {}));
  return { deltas, typed: deltas.join("") };
}

test("live mode types each word once the next one has started", () => {
  const { deltas, typed } = run("live", [
    ["Hel"],
    ["Hello"],
    ["Hello wor"],
    ["Hello world, "],
    ["Hello world, how"],
    ["Hello world, how are you?", { final: true }],
  ]);
  assert.deepEqual(deltas, ["", "", "Hello ", "world, ", "", "how are you?"]);
  assert.equal(typed, "Hello world, how are you?");
});

test("live mode types the unfinished last word as soon as the speaker pauses", () => {
  const { deltas, typed } = run("live", [
    ["Open the file"],
    ["Open the file", { pause: true }],
    ["Open the file."],
    ["Open the file. Then", { pause: false }],
    ["Open the file. Then save it.", { final: true }],
  ]);
  assert.deepEqual(deltas, ["Open the ", "file", "", ". ", "Then save it."]);
  assert.equal(typed, "Open the file. Then save it.");
});

test("phrase mode types only at pauses and at the end", () => {
  const { deltas, typed } = run("phrase", [
    ["Hello wor"],
    ["Hello world. ", { pause: true }],
    ["Hello world. Second"],
    ["Hello world. Second phrase", { final: true }],
  ]);
  assert.deepEqual(deltas, ["", "Hello world.", "", " Second phrase"]);
  assert.equal(typed, "Hello world. Second phrase");
});

test("a later session is separated from the previous one by a space", () => {
  const c = new TextCommitter("live");
  c.startSession(false);
  assert.equal(c.update("First.", { final: true }), "First.");
  c.startSession(true);
  assert.equal(c.update("Second "), " Second ");
  assert.equal(c.update("Second one", { final: true }), "one");
});

test("an empty session types nothing", () => {
  const { typed } = run("live", [[""], ["", { final: true }]]);
  assert.equal(typed, "");
});

test("text after an unfinished '<' is held back until the tag closes", () => {
  const { deltas } = run("live", [["Done. <en"], ["Done. <en-US> Next "]]);
  assert.equal(deltas[0], "Done. ");
  assert.equal(deltas[1], "<en-US> Next ");
});

test("a transcript revision never deletes typed text", () => {
  const { deltas } = run("live", [["I scream "], ["Ice cream is "], ["Ice cream is good", { final: true }]]);
  assert.equal(deltas[0], "I scream ");
  // Continues from the same offset instead of retyping or deleting.
  assert.equal(deltas[1], " is ");
  assert.equal(deltas[2], "good");
});

test("cleanTranscript drops tags and collapses whitespace", () => {
  assert.equal(cleanTranscript(" Mr.  Quilter is <en-US> here"), "Mr. Quilter is here");
  assert.equal(cleanTranscript("Hello  "), "Hello ");
  assert.equal(cleanTranscript(""), "");
});

test("cleanTranscript keeps append-only growth append-only", () => {
  const raw = " Please  refactor the  login function. ";
  let prev = "";
  for (let i = 1; i <= raw.length; i++) {
    const cur = cleanTranscript(raw.slice(0, i));
    assert.ok(cur.startsWith(prev), `${JSON.stringify(cur)} should extend ${JSON.stringify(prev)}`);
    prev = cur;
  }
});
