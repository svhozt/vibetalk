export function isMac(): boolean {
  return process.platform === "darwin";
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isLinux(): boolean {
  return process.platform === "linux";
}

export function isWayland(): boolean {
  return process.env["XDG_SESSION_TYPE"] === "wayland";
}

export function accessibilityInstructions(): string {
  if (isMac()) {
    return [
      "macOS needs Accessibility permission to type into other apps:",
      "  System Settings → Privacy & Security → Accessibility → enable your terminal app",
      "  (Terminal, iTerm2, VS Code, Ghostty, …), then restart the terminal.",
    ].join("\n");
  }
  if (isLinux()) {
    return isWayland()
      ? "On Wayland, simulated typing needs ydotool (with ydotoold running) or use --typing-strategy clipboard."
      : "On X11, typing uses the XTest extension. Install xdotool for the clipboard fallback.";
  }
  return "";
}

export function microphoneInstructions(): string {
  if (isMac()) {
    return [
      "macOS needs Microphone permission for your terminal app:",
      "  System Settings → Privacy & Security → Microphone → enable your terminal app,",
      "  then restart the terminal.",
    ].join("\n");
  }
  if (isWindows()) {
    return "Windows: Settings → Privacy & security → Microphone → allow desktop apps to access the microphone.";
  }
  return "Check that your microphone is connected and not muted (try `vibetalk devices`).";
}
