/**
 * Vidriera-Video — fail-safe checks (FASE HORNO §7).
 *
 * Pure pass/fail predicates the orchestrator runs BEFORE publishing. If any
 * fails the orchestrator does NOT publish: it writes demos.promo_error and
 * alerts. Kept pure (no IO) so they are fully unit-tested; the orchestrator
 * gathers the inputs (HTTP status, ffprobe duration/streams) and feeds them in.
 */

export interface FailSafeInput {
  /** HTTP status returned by GET-ing the demo URL. */
  demoUrlStatus: number;
  /** Probed duration (s) of the editor_machine render. */
  renderSec: number;
  /** Duration (s) of the voice-over the render is synced to. */
  audioSec: number;
  /** Whether the render actually carries an audio stream. */
  renderHasAudioTrack: boolean;
  /** The VO script text — the source the engine burns as subtitles. */
  scriptText: string;
  /** The caption to be posted. */
  caption: string;
  /** Allowed |render−audio| gap. Default 0.5s (catches gross desync, not frames). */
  durationToleranceSec?: number;
  /** Minimum VO script length to consider subtitles non-empty. Default 40. */
  minScriptChars?: number;
}

export interface FailSafeResult {
  ok: boolean;
  failures: string[];
}

const DEFAULT_DURATION_TOLERANCE_SEC = 0.5;
const DEFAULT_MIN_SCRIPT_CHARS = 40;

/** |render − audio| within tolerance (the engine trims the render to the VO). */
export function renderDurationOk(
  renderSec: number,
  audioSec: number,
  toleranceSec = DEFAULT_DURATION_TOLERANCE_SEC,
): boolean {
  if (!(renderSec > 0) || !(audioSec > 0)) return false;
  return Math.abs(renderSec - audioSec) <= toleranceSec;
}

/** True if the caption uses the word "demo"/"demos" (forbidden — spec §0.7). */
export function captionMentionsDemo(caption: string): boolean {
  // Whole-word "demo"/"demos" only — "demostración" (a legit Spanish word) is fine.
  return /\bdemos?\b/i.test(caption);
}

/** Run every fail-safe; ok=false lists each reason (for promo_error + alert). */
export function evaluateFailSafes(input: FailSafeInput): FailSafeResult {
  const tol = input.durationToleranceSec ?? DEFAULT_DURATION_TOLERANCE_SEC;
  const minChars = input.minScriptChars ?? DEFAULT_MIN_SCRIPT_CHARS;
  const failures: string[] = [];

  if (!(input.demoUrlStatus >= 200 && input.demoUrlStatus < 400)) {
    failures.push(`demo_url_not_ok: HTTP ${input.demoUrlStatus}`);
  }
  if (!renderDurationOk(input.renderSec, input.audioSec, tol)) {
    failures.push(
      `render_duration_mismatch: render=${input.renderSec}s vs audio=${input.audioSec}s (tol ${tol}s)`,
    );
  }
  if (!input.renderHasAudioTrack) {
    failures.push('render_missing_audio_track');
  }
  if (input.scriptText.trim().length < minChars) {
    failures.push(
      `subtitle_source_too_short: script has ${input.scriptText.trim().length} chars (min ${minChars})`,
    );
  }
  if (captionMentionsDemo(input.caption)) {
    failures.push('caption_says_demo: caption uses the forbidden word "demo" (spec §0.7)');
  }

  return { ok: failures.length === 0, failures };
}
