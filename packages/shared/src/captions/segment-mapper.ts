import type { Word, CaptionLine } from './types.js';

const PUNCTUATION_RE = /[.!?,]$/;

/**
 * Groups words into caption lines suitable for video display.
 *
 * Rules applied in order:
 *  1. Break when `maxWordsPerLine` is reached (default 5).
 *  2. Break when the accumulated line duration exceeds `maxLineDurationMs` (default 1800ms).
 *  3. Break after a word that ends with punctuation (., !, ?, ,).
 */
export function groupWordsIntoLines(
  words: Word[],
  opts?: { maxWordsPerLine?: number; maxLineDurationMs?: number },
): CaptionLine[] {
  const maxWords = opts?.maxWordsPerLine ?? 6;
  const maxDurationMs = opts?.maxLineDurationMs ?? 1800;

  const lines: CaptionLine[] = [];
  let current: Word[] = [];

  function flush(): void {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    lines.push({
      words: current,
      startMs: first.startMs,
      endMs: last.endMs,
      text: current.map((w) => w.text).join(' '),
    });
    current = [];
  }

  for (const word of words) {
    current.push(word);

    const first = current[0]!;
    const lineDurationMs = word.endMs - first.startMs;
    const atMaxWords = current.length >= maxWords;
    const atMaxDuration = lineDurationMs >= maxDurationMs;
    const endsWithPunctuation = PUNCTUATION_RE.test(word.text) && current.length >= 2;

    if (atMaxWords || atMaxDuration || endsWithPunctuation) {
      flush();
    }
  }

  flush();
  return lines;
}

// ---------------------------------------------------------------------------
// Segment alignment helpers
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.\-/]/g, ' ')  // separators become spaces so "Next.js" → "next js"
    .replace(/[^a-z0-9áéíóúüñàèìòùâêîôû\s]/g, '');
}

function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Jaccard similarity between two token arrays.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Aligns words from the transcript to each voiceover segment using a
 * sliding-window Jaccard similarity approach.
 *
 * Best-effort — word boundaries may not align perfectly with segment text.
 * Each segment claims consecutive words from the remaining pool.
 */
export function mapSegmentsToWords(
  words: Word[],
  segments: Array<{ voiceover: string; index: number }>,
): Array<{
  segmentIndex: number;
  startSec: number;
  endSec: number;
  words: Word[];
}> {
  if (words.length === 0 || segments.length === 0) return [];

  // Sort segments by index so we consume words in order
  const sorted = [...segments].sort((a, b) => a.index - b.index);

  const results: Array<{
    segmentIndex: number;
    startSec: number;
    endSec: number;
    words: Word[];
  }> = [];

  let consumed = 0; // pointer into words[]

  for (let si = 0; si < sorted.length; si++) {
    const seg = sorted[si]!;
    const voiceTokens = tokenize(seg.voiceover);
    const windowSize = Math.max(voiceTokens.length, 1);

    const remaining = words.slice(consumed);

    if (remaining.length === 0) {
      results.push({ segmentIndex: seg.index, startSec: 0, endSec: 0, words: [] });
      continue;
    }

    // For the last segment, take everything left
    if (si === sorted.length - 1) {
      const slice = remaining;
      const first = slice[0]!;
      const last = slice[slice.length - 1]!;
      results.push({
        segmentIndex: seg.index,
        startSec: first.startMs / 1000,
        endSec: last.endMs / 1000,
        words: slice,
      });
      consumed += slice.length;
      continue;
    }

    // Slide a window of `windowSize` words through the remaining pool,
    // pick the window with the highest Jaccard similarity to voiceTokens.
    let bestStart = 0;
    let bestScore = -1;

    const maxStart = Math.max(0, remaining.length - Math.floor(windowSize / 2));

    for (let wi = 0; wi <= maxStart; wi++) {
      const end = Math.min(wi + windowSize, remaining.length);
      const window = remaining.slice(wi, end).map((w) => w.text);
      const score = jaccardSimilarity(tokenize(window.join(' ')), voiceTokens);
      if (score > bestScore) {
        bestScore = score;
        bestStart = wi;
      }
    }

    if (bestScore < 0.15 && voiceTokens.length > 0) {
      console.warn(`[captions] Low alignment confidence (score=${bestScore.toFixed(2)}) for segment ${seg.index}. Check if transcript matches script.`);
    }

    // Claim words from consumed up to (but not including) bestStart + windowSize
    // We always advance at least windowSize words to avoid stalls.
    const claimEnd = Math.min(bestStart + windowSize, remaining.length);
    const slice = remaining.slice(0, claimEnd);

    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    results.push({
      segmentIndex: seg.index,
      startSec: first.startMs / 1000,
      endSec: last.endMs / 1000,
      words: slice,
    });
    consumed += claimEnd;
  }

  return results.sort((a, b) => a.segmentIndex - b.segmentIndex);
}
