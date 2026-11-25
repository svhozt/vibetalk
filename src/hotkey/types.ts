export interface IHotkeyListener {
  /** Human-readable trigger, e.g. "Enter" or "Ctrl+Shift+Space". */
  readonly label: string;
  /** True when using this trigger means the user is focused on the VibeTalk terminal. */
  readonly focusesTerminal: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  onToggle(callback: (fromTerminal: boolean) => void): void;
  /** Called when the user asks to quit (Ctrl+C, or stdin closed). */
  onQuit?(callback: () => void): void;
}
