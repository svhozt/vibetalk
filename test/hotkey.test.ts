import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHotkey } from "../src/hotkey/GlobalHotkey.js";

test("parseHotkey understands modifiers and aliases", () => {
  const h = parseHotkey("Ctrl+Shift+Space");
  assert.deepEqual([...h.modifiers].sort(), ["ctrl", "shift"]);
  assert.equal(h.key, "Space");
  assert.deepEqual([...parseHotkey("cmd+option+d").modifiers].sort(), ["alt", "meta"]);
  assert.equal(parseHotkey("f9").key, "F9");
  assert.equal(parseHotkey("ctrl+enter").key, "Enter");
  assert.equal(parseHotkey("ctrl+shift+v").key, "V");
});

test("parseHotkey rejects incomplete combos", () => {
  assert.throws(() => parseHotkey("ctrl+shift"), /needs a key/);
  assert.throws(() => parseHotkey("a+b"), /more than one/);
});
