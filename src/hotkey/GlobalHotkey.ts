import { createRequire } from "node:module";
import { HotkeyError, errorMessage } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { accessibilityInstructions, isMac } from "../utils/platform.js";
import type { IHotkeyListener } from "./types.js";

interface UiohookKeyboardEvent {
  keycode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}
interface UiohookModule {
  uIOhook: {
    on(event: "keydown", cb: (e: UiohookKeyboardEvent) => void): void;
    off(event: "keydown", cb: (e: UiohookKeyboardEvent) => void): void;
    start(): void;
    stop(): void;
  };
  UiohookKey: Record<string, number>;
}

const MODIFIERS = ["ctrl", "shift", "alt", "meta"] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Our key names → uiohook-napi `UiohookKey` names. Letters, digits and F1–F24 map 1:1. */
const KEY_ALIASES: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  backtick: "Backquote",
  backquote: "Backquote",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

export interface ParsedHotkey {
  modifiers: Set<Modifier>;
  /** uiohook key name, e.g. "Space", "V", "F9". */
  key: string;
}

export function parseHotkey(combo: string): ParsedHotkey {
  const parts = combo.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
  const modifiers = new Set<Modifier>();
  let key = "";
  for (const p of parts) {
    if (p === "ctrl" || p === "control") modifiers.add("ctrl");
    else if (p === "shift") modifiers.add("shift");
    else if (p === "alt" || p === "option" || p === "opt") modifiers.add("alt");
    else if (p === "meta" || p === "cmd" || p === "command" || p === "win" || p === "super") modifiers.add("meta");
    else if (!key) key = KEY_ALIASES[p] ?? (/^f\d{1,2}$/.test(p) ? p.toUpperCase() : p.length === 1 ? p.toUpperCase() : p);
    else throw new HotkeyError(`Hotkey "${combo}" has more than one non-modifier key`);
  }
  if (!key) throw new HotkeyError(`Hotkey "${combo}" needs a key, e.g. ctrl+shift+space`);
  return { modifiers, key };
}

export function hotkeyLabel(combo: string): string {
  const names: Record<Modifier, string> = { ctrl: "Ctrl", shift: "Shift", alt: isMac() ? "Option" : "Alt", meta: isMac() ? "Cmd" : "Win" };
  const { modifiers, key } = parseHotkey(combo);
  return [...MODIFIERS.filter((m) => modifiers.has(m)).map((m) => names[m]), key].join("+");
}

/** Holding the hotkey auto-repeats keydown; ignore presses closer together than this. */
const DEBOUNCE_MS = 400;

/**
 * System-wide hotkey (works while another app is focused), via uiohook-napi
 * (libuiohook, native builds for macOS arm64/x64, Linux and Windows).
 * Listen-only: the key combo still reaches the focused app, so pick one
 * your apps don't use.
 */
export class GlobalHotkey implements IHotkeyListener {
  readonly label: string;
  readonly focusesTerminal = false;
  private readonly hotkey: ParsedHotkey;
  private mod: UiohookModule | null = null;
  private toggleCallback: ((fromTerminal: boolean) => void) | null = null;
  private lastFired = 0;

  constructor(combo: string) {
    this.hotkey = parseHotkey(combo);
    this.label = hotkeyLabel(combo);
  }

  private readonly onKeyDown = (e: UiohookKeyboardEvent) => {
    const code = this.mod?.UiohookKey[this.hotkey.key];
    if (code === undefined || e.keycode !== code) return;
    const m = this.hotkey.modifiers;
    if (e.ctrlKey !== m.has("ctrl") || e.shiftKey !== m.has("shift") || e.altKey !== m.has("alt") || e.metaKey !== m.has("meta")) {
      return;
    }
    const now = Date.now();
    if (now - this.lastFired < DEBOUNCE_MS) return;
    this.lastFired = now;
    logger.debug("Global hotkey pressed");
    this.toggleCallback?.(false);
  };

  async start(): Promise<void> {
    const require = createRequire(import.meta.url);
    try {
      this.mod = require("uiohook-napi") as UiohookModule;
    } catch (err) {
      throw new HotkeyError(`Global hotkeys are not available on this system: ${errorMessage(err)}`);
    }
    if (this.mod.UiohookKey[this.hotkey.key] === undefined) {
      throw new HotkeyError(`Unsupported hotkey key "${this.hotkey.key}". Use a letter, digit, F1–F24, space, enter, tab, esc…`);
    }
    this.mod.uIOhook.on("keydown", this.onKeyDown);
    try {
      this.mod.uIOhook.start();
    } catch (err) {
      this.mod.uIOhook.off("keydown", this.onKeyDown);
      throw new HotkeyError(
        `Could not start the global hotkey: ${errorMessage(err)}` +
          (isMac() ? `\n${accessibilityInstructions()}\nAlso enable your terminal under Privacy & Security → Input Monitoring.` : ""),
      );
    }
    logger.debug(`Global hotkey active: ${this.label}`);
  }

  async stop(): Promise<void> {
    // Detach only. uIOhook.stop() can block indefinitely on macOS; the hook
    // thread ends with the process, and stop() is only called on shutdown.
    this.mod?.uIOhook.off("keydown", this.onKeyDown);
  }

  onToggle(callback: (fromTerminal: boolean) => void): void {
    this.toggleCallback = callback;
  }
}
