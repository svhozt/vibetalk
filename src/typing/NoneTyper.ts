import type { ITyper } from "./types.js";

/** Does not type anything; the transcript is only shown in the terminal. */
export class NoneTyper implements ITyper {
  readonly name = "none";
  readonly prefersPhrases = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async type(): Promise<void> {
    // intentionally empty
  }
}
