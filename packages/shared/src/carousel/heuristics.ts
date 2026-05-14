/**
 * Heuristics: infer `additional_angles`, `additional_tones`, and
 * `target_slide_count` from a topic title.
 *
 * Used when a user creates a brand-new topic (via the carousel form's
 * "type your own" path) so the scheduler immediately has variety to work
 * with instead of locking the new topic to whatever angle/tone the user
 * picked for that one carousel.
 *
 * This function is PURE — no DB, no IO. Test it with title strings.
 *
 * Why heuristics and not LLM:
 *   - Deterministic, free, latency-free.
 *   - Failure mode is "no defaults inferred" → safe fallback to the
 *     scheduler's existing behaviour (use suggested_*, random slide count).
 *   - Easy to extend with new patterns.
 *
 * The output is *additive*: it never overwrites a topic's seed-curated
 * data. The caller (queries.applyHeuristicDefaults) guards the UPDATE
 * to only fire when the columns are at their factory defaults.
 */

export type CarouselAngle =
  | 'educational'
  | 'contrarian'
  | 'story-arc'
  | 'before-after'
  | 'listicle';

export type CarouselTone = 'direct' | 'authoritative' | 'casual' | 'contrarian';

export interface InferredTopicDefaults {
  additionalAngles: CarouselAngle[];
  additionalTones: CarouselTone[];
  targetSlideCount: number | null;
}

/**
 * "N + content-noun" pattern — captures the count and the noun. Matches:
 *   "5 errores que..."         → N=5, noun=errores
 *   "Las 3 cosas que..."       → N=3, noun=cosas
 *   "7 preguntas que..."       → N=7, noun=preguntas
 *
 * Bounded to 3..9 because:
 *   - Under 3: would yield a carousel <5 slides (n+2), too short for a
 *     listicle arc that has hook+intro+items+cta.
 *   - Over 9: would exceed IG's 10-slide cap once we add intro/outro.
 */
const NUM_CONTENT_RE =
  /\b([3-9])\s+(errores|razones|cosas|pasos|tips|claves|preguntas|funcionalidades|formas|maneras|m[ií]tos|verdades|se[ñn]ales|signos|reglas|ventajas|desventajas|beneficios)\b/i;

export function inferTopicDefaults(rawTitle: string): InferredTopicDefaults {
  const t = rawTitle.trim().toLowerCase();

  // ── target_slide_count ─────────────────────────────────────────────
  // "5 errores" → 7 total (hook + 5 items + cta). Bounded to [3, 10] by
  // schema constraint; we already keep N in [3, 9] so N+2 ∈ [5, 11] —
  // clamp the upper bound just in case.
  let targetSlideCount: number | null = null;
  const m = t.match(NUM_CONTENT_RE);
  if (m) {
    const n = parseInt(m[1]!, 10);
    const total = n + 2;
    if (total >= 3 && total <= 10) targetSlideCount = total;
  }

  // ── additional_angles ──────────────────────────────────────────────
  // We use substring matching (`includes`) for multi-word phrases and for
  // anything containing non-ASCII characters, because JS `\b` is ASCII-
  // only and breaks around accented letters like 'é', 'í', 'ó'. Pure-ASCII
  // single-word tokens still use `\b` regex for precision.
  const has = (sub: string): boolean => t.includes(sub);
  const hasAny = (subs: string[]): boolean => subs.some((s) => t.includes(s));

  const angles = new Set<CarouselAngle>();
  if (has('antes y despues') || has('antes y después')) angles.add('before-after');
  if (/\b(vs|versus)\b/i.test(t) || has('comparacion') || has('comparación')) {
    angles.add('listicle');
  }
  if (
    hasAny(['por que', 'por qué', 'mito', 'nunca', 'no es', 'no reemplaza'])
  ) {
    angles.add('contrarian');
  }
  if (NUM_CONTENT_RE.test(t)) angles.add('listicle');
  if (has('como ') || has('cómo ')) angles.add('educational');
  if (hasAny(['historia', 'el dia que', 'el día que', 'la vez que'])) {
    angles.add('story-arc');
  }

  // ── additional_tones ───────────────────────────────────────────────
  // Numbered listicles + "por qué" framings tend to land well with an
  // authoritative voice in addition to whatever tone the user picked.
  const tones = new Set<CarouselTone>();
  if (NUM_CONTENT_RE.test(t)) tones.add('authoritative');
  if (hasAny(['por que', 'por qué'])) tones.add('authoritative');
  if (has('como ') || has('cómo ')) tones.add('casual');

  return {
    additionalAngles: [...angles],
    additionalTones: [...tones],
    targetSlideCount,
  };
}
