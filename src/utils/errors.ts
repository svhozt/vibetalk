/** An error whose message is meant to be shown to the user as-is (no stack trace). */
export class VibeTalkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "VibeTalkError";
  }
}

export class ConfigError extends VibeTalkError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class AudioError extends VibeTalkError {
  constructor(message: string) {
    super(message, "AUDIO_ERROR");
    this.name = "AudioError";
  }
}

export class ModelError extends VibeTalkError {
  constructor(message: string) {
    super(message, "MODEL_ERROR");
    this.name = "ModelError";
  }
}

export class TypingError extends VibeTalkError {
  constructor(message: string) {
    super(message, "TYPING_ERROR");
    this.name = "TypingError";
  }
}

export class HotkeyError extends VibeTalkError {
  constructor(message: string) {
    super(message, "HOTKEY_ERROR");
    this.name = "HotkeyError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
