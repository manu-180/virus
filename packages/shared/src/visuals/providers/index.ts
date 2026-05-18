/**
 * Provider router for the visual-assets pipeline.
 *
 * The strategy is locked in the spec (`docs/superpowers/specs/2026-05-05-cinematic-ai-assets-pipeline-design.md`):
 *
 *  - hook   → Luma Ray 2 (video)  — first 0-3s, retention-critical, motion engages.
 *  - reveal → Gemini Imagen 4 (image) — punchline, strong static composition + Ken Burns.
 *  - cta    → Luma Ray 2 (video)  — closing, motion signals quality + drives swipes.
 */

import type { AssetCategory } from '../types.js';

export { generateVideoLuma } from './luma.js';
export type { LumaGenInput, LumaGenOutput } from './luma.js';

export { generateImageGemini } from './gemini.js';
export type { GeminiGenInput, GeminiGenOutput } from './gemini.js';

export { embedText, EMBEDDING_DIMENSIONS } from './gemini-embedding.js';

/** Provider + asset-type pairing for a given slot. */
export interface ProviderChoice {
  provider: 'luma' | 'gemini';
  type: 'video' | 'image';
}

/**
 * Per-slot provider strategy. Locked in the spec — do not vary at runtime
 * unless the spec is amended. Switching providers per slot would invalidate
 * cache hashes and the per-slot pricing table.
 */
export function pickProvider(category: AssetCategory): ProviderChoice {
  switch (category) {
    case 'hook':
      return { provider: 'luma', type: 'video' };
    case 'reveal':
      return { provider: 'gemini', type: 'image' };
    case 'cta':
      return { provider: 'luma', type: 'video' };
  }
}

/**
 * Default Luma clip duration in seconds for each slot.
 *
 * Luma Ray 2 ONLY accepts `'5s'`, `'9s'` or `'10s'`. Any other value (e.g.
 * `'6s'`) returns HTTP 400 `"Input should be '5s', '9s' or '10s' duration"`.
 * - `cta`: 5s — sits behind a single line of voiceover.
 * - `hook`: 9s — needs more room for visual setup before the reveal.
 *
 * Reveal is an image (no duration), but the function returns 9 for
 * completeness — callers should ignore it for image slots.
 */
export function defaultDurationFor(category: AssetCategory): number {
  return category === 'cta' ? 5 : 9;
}
