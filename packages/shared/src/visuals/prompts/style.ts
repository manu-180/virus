// ---------------------------------------------------------------------------
// "Cinematic Dev Noir" — fixed style descriptors injected into every prompt.
//
// These pools keep generated assets visually consistent across runs while
// still providing enough variety (via deterministic seeded picks) so we don't
// produce 200 identical clips.
// ---------------------------------------------------------------------------

export const STYLE_NAME = 'cinematic dev noir';

export const CAMERA_DESCRIPTORS = [
  'shallow depth of field',
  'anamorphic feel',
  'slow dolly-in',
  'cinematic framing',
  '35mm equivalent',
];

export const LIGHTING_DESCRIPTORS = [
  'dim ambient lighting',
  'volumetric light shafts',
  'dust particles in the air',
  'high contrast',
  'moody chiaroscuro',
];

export const SUBJECT_POOL_HOOK = [
  'developer terminal with green code on a dark monitor',
  'rgb mechanical keyboard close-up in dim light',
  'multiple ultrawide monitors in a dark room',
  'hands typing on a backlit keyboard',
  'fiber optic cables glowing',
  'cpu and circuit board macro shot',
];

export const SUBJECT_POOL_CTA = [
  'a single monitor displaying a clean dashboard',
  'developer hands closing a laptop',
  'a glowing notification on a dark screen',
  'fingers tapping a smartphone in low light',
];

export const REVEAL_COMPOSITIONS = [
  'product photography style hero shot',
  'apple keynote style product reveal',
  'minimalist composition with strong directional light',
  'one object centered with negative space',
];

export const NEGATIVE_PROMPT = [
  'matrix code rain',
  'glitch effect',
  'fake hacker aesthetic',
  'wide angle of person at desk',
  'deformed hands',
  'extra fingers',
  'text artifacts',
  'oversaturated colors',
  'cartoon',
  'anime',
].join(', ');

/**
 * Deterministic pick from a pool given a seed.
 * Same `(arr, seed)` always returns the same item.
 */
export function pickRandom<T>(arr: readonly T[], seed: number): T {
  if (arr.length === 0) {
    throw new Error('pickRandom: array is empty');
  }
  const idx = Math.abs(seed) % arr.length;
  // Safe: idx in [0, arr.length-1], but TS noUncheckedIndexedAccess returns T|undefined.
  return arr[idx] as T;
}
