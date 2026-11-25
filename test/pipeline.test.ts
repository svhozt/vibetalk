import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { AudioSource } from "../src/audio/types.js";
import { Pipeline } from "../src/core/Pipeline.js";
import type { Recognizer } from "../src/engine/Recognizer.js";
import type { ITyper } from "../src/typing/types.js";

/** Recogniser stand-in: each accepted frame reveals one more character of a script. */
function fakeRecognizer(script: string): Recognizer {
  return {
    createSession() {
      let n = 0;
      let done = false;
      return {
        accept: () => script.slice(0, done ? script.length : ++n),
        isPause: () => false,
        finish: () => {
          done = true;
          return script;
        },
        get text() {
          return script.slice(0, n);
        },
      };
    },
  } as unknown as Recognizer;
}

class FakeSource extends EventEmitter implements AudioSource {
  label = "fake";
  async start() {}
  async stop() {}
  push(n: number) {
    for (let i = 0; i < n; i++) this.emit("frame", new Float32Array(512));
  }
}

class SlowTyper implements ITyper {
  readonly name = "robotjs" as const;
  typed = "";
  constructor(
    readonly prefersPhrases = false,
    private readonly delayMs = 5,
  ) {}
  async isAvailable() {
    return true;
  }
  async type(text: string) {
    await new Promise((r) => setTimeout(r, this.delayMs));
    this.typed += text;
  }
}

test("live mode types words while speaking and drains everything on stop", async () => {
  const script = "Please refactor the login function";
  const source = new FakeSource();
  const typer = new SlowTyper(false, 20);
  const p = new Pipeline(fakeRecognizer(script), typer, { typeMode: "live", createSource: () => source });
  await p.start();
  source.push(20); // "Please refactor the " visible
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(typer.typed, "Please refactor the ");
  const stats = await p.stop();
  // stop() must wait for the typing queue instead of dropping the tail.
  assert.equal(typer.typed, script);
  assert.equal(stats?.charactersTyped, script.length);
  assert.equal(stats?.words, 5);
  assert.equal(p.getState(), "idle");
});

test("stopping from the terminal keeps the final words out of it", async () => {
  const script = "Please refactor the login function";
  const source = new FakeSource();
  const typer = new SlowTyper(false, 0);
  const p = new Pipeline(fakeRecognizer(script), typer, { typeMode: "live", createSource: () => source });
  await p.start();
  source.push(20);
  const stats = await p.stop({ typeTail: false });
  assert.equal(typer.typed, "Please refactor the ");
  assert.equal(stats?.untypedTail, "login function");
  assert.equal(stats?.text, script);
});

test("typers that prefer phrases switch live mode to phrase mode", async () => {
  const source = new FakeSource();
  const typer = new SlowTyper(true, 1);
  const p = new Pipeline(fakeRecognizer("one two three"), typer, { typeMode: "live", createSource: () => source });
  assert.equal(p.typeMode, "phrase");
  await p.start();
  source.push(13);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(typer.typed, "");
  await p.stop();
  assert.equal(typer.typed, "one two three");
});

test("consecutive sessions are joined with a space", async () => {
  const typer = new SlowTyper(false, 0);
  const p = new Pipeline(fakeRecognizer("Hi there."), typer, { typeMode: "live", createSource: () => new FakeSource() });
  await p.start();
  await p.stop();
  await p.start();
  await p.stop();
  assert.equal(typer.typed, "Hi there. Hi there.");
});

test("a failing typer reports an error but the session still ends", async () => {
  const p = new Pipeline(
    fakeRecognizer("text"),
    { name: "robotjs", prefersPhrases: false, isAvailable: async () => true, type: async () => Promise.reject(new Error("no permission")) },
    { typeMode: "live", createSource: () => new FakeSource() },
  );
  const errors: string[] = [];
  p.on("error", (e: Error) => errors.push(e.message));
  await p.start();
  await p.stop();
  assert.deepEqual(errors, ["Typing failed: no permission"]);
  assert.equal(p.getState(), "idle");
});
