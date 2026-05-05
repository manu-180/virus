// ---------------------------------------------------------------------------
// Prompt builder for the 3 visual slots: hook / reveal / cta.
//
// Deterministic given (seed, themeColor, script, brand, language, template)
// — same inputs always produce the same prompts. This is critical for the
// cache: the prompt feeds into `computePromptHash`, so deterministic prompts
// = stable hash = correct cache hits across retries of the same video.
// ---------------------------------------------------------------------------

import type { ScriptOutput } from '../../ai/index.js';
import {
  CAMERA_DESCRIPTORS,
  LIGHTING_DESCRIPTORS,
  NEGATIVE_PROMPT,
  REVEAL_COMPOSITIONS,
  STYLE_NAME,
  SUBJECT_POOL_CTA,
  SUBJECT_POOL_HOOK,
  pickRandom,
} from './style.js';

export interface BuildPromptsInput {
  script: ScriptOutput;
  themeColor: string;
  /** Optional 1-line brand context (woven into reveal as anchor). */
  brandOneLiner?: string;
  language: string;
  template: string;
  /** Seed for deterministic picks. Use `seedFromVideoId(videoId)`. */
  seed: number;
}

export interface BuiltPrompts {
  hook: string;
  reveal: string;
  cta: string;
}

/**
 * Build the 3 cinematic-dev-noir prompts for a given video.
 *
 * Each prompt is a single string consumable by Luma / Gemini. They always
 * include camera + lighting + theme-color accent + style tag + negative prompt.
 */
export function buildPrompts(input: BuildPromptsInput): BuiltPrompts {
  const { themeColor, seed, script, brandOneLiner } = input;

  const hookSubject = pickRandom(SUBJECT_POOL_HOOK, seed);
  const ctaSubject = pickRandom(SUBJECT_POOL_CTA, seed + 1);
  const revealComp = pickRandom(REVEAL_COMPOSITIONS, seed + 2);

  const camera = pickRandom(CAMERA_DESCRIPTORS, seed);
  const lighting = pickRandom(LIGHTING_DESCRIPTORS, seed + 1);

  const accent = `${themeColor} neon accent`;

  // Find the segment that should anchor the reveal image.
  const revealSeg = script.segments.find((s) => s.role === 'reveal');
  const revealText =
    revealSeg?.onScreenText?.trim() ||
    revealSeg?.voiceover?.trim() ||
    brandOneLiner?.trim() ||
    'a key insight';

  // Truncated to keep prompt length sane (provider tokens / quality).
  const revealAnchor = revealText.slice(0, 80);

  const base = `${camera}, ${lighting}, ${accent}, ${STYLE_NAME} style. AVOID: ${NEGATIVE_PROMPT}.`;

  return {
    hook: `${hookSubject}, ${base}`,
    reveal: `${revealComp} symbolizing "${revealAnchor}", ${base}`,
    cta: `${ctaSubject}, ${base}`,
  };
}

/**
 * Convert a video id (uuid or any string) into a stable non-negative integer
 * seed for `pickRandom`. Java-style 31-multiplier hash. Deterministic.
 */
export function seedFromVideoId(videoId: string): number {
  let h = 0;
  for (let i = 0; i < videoId.length; i++) {
    h = (h * 31 + videoId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
