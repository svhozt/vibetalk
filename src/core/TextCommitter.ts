import * as logger from "../utils/logger.js";

export type TypeMode = "live" | "phrase";

/**
 * Decides which part of a growing transcript is safe to type.
 *
 * The streaming recognisers VibeTalk uses (greedy transducer search) only ever
 * append to their hypothesis, so typed text never has to be taken back:
 *  - live mode types each word as soon as the next word has started
 *    (i.e. the text up to the last space), and the rest when the speaker
 *    pauses — so a phrase is complete before you switch windows;
 *  - phrase mode types whole phrases when the speaker pauses;
 *  - at the end of a session everything left is typed.
 *
 * If a transcript ever stops extending what was typed (not observed with the
 * shipped models), nothing already typed is deleted: typing continues from
 * the same character offset.
 */
export class TextCommitter {
  private typed = "";
  private needsLeadingSpace = false;

  constructor(private readonly mode: TypeMode) {}

  /** Start a new recording session. `afterPrevious` = something was typed before in this run. */
  startSession(afterPrevious: boolean): void {
    this.typed = "";
    this.needsLeadingSpace = afterPrevious;
  }

  /** Text of the current session already handed to the typer. */
  get committed(): string {
    return this.typed;
  }

  /**
   * Given the full session transcript, return the new text to type now
   * (possibly ""). `pause` = speaker is pausing; `final` = session ended.
   */
  update(text: string, opts: { pause?: boolean; final?: boolean } = {}): string {
    const safe = holdBackOpenTag(text);
    let target: string;
    if (opts.final) {
      target = safe.replace(/\s+$/, "");
    } else if (this.mode === "live") {
      target = opts.pause ? safe.replace(/\s+$/, "") : safe.slice(0, safe.lastIndexOf(" ") + 1);
    } else {
      target = opts.pause ? safe.replace(/\s+$/, "") : "";
    }

    if (target.length <= this.typed.length) return "";
    if (!target.startsWith(this.typed)) {
      logger.debug(`Transcript revised after typing: typed=${JSON.stringify(this.typed)} now=${JSON.stringify(target)}`);
    }
    let delta = target.slice(this.typed.length);
    this.typed = target;
    if (this.needsLeadingSpace && delta.length > 0) {
      if (!/^\s/.test(delta)) delta = " " + delta;
      this.needsLeadingSpace = false;
    }
    // Phrase mode types "phrase one" then later "phrase one, phrase two":
    // the second delta starts with the space that was trimmed before.
    return delta;
  }
}

/** Exclude a trailing "<..." that could still turn into a special tag. */
function holdBackOpenTag(text: string): string {
  const open = text.lastIndexOf("<");
  if (open === -1 || text.indexOf(">", open) !== -1) return text;
  return text.slice(0, open);
}
