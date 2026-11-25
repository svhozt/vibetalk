let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function isVerbose(): boolean {
  return verbose;
}

export function debug(...args: unknown[]): void {
  if (verbose) {
    console.error(`[vibetalk:debug]`, ...args);
  }
}

export function warn(...args: unknown[]): void {
  console.error(`[vibetalk:warn]`, ...args);
}

export function error(...args: unknown[]): void {
  console.error(`[vibetalk:error]`, ...args);
}
