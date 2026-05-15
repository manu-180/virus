/**
 * Tests for auto-publish-scheduler helpers.
 *
 * We test the *pure* picker functions in isolation. The Inngest function
 * itself is integration-tested via the staging cron; here we only verify
 * that given correct inputs, the selection logic does what we expect.
 *
 * Covered:
 *  - buildAllowedSet: dedup + null-filter + suggested-first ordering.
 *  - selectLeastUsed: tie-break ordering (count → lastUsedAt → allowed[] order).
 *  - isWindowOpen: UTC arithmetic incl. windows straddling midnight.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAllowedSet,
  selectLeastUsed,
  isWindowOpen,
  effectiveIdempotencyMs,
  effectivePostCount24h,
} from '../auto-publish-scheduler.js';

describe('buildAllowedSet', () => {
  it('returns suggested + additionals deduplicated in order', () => {
    expect(buildAllowedSet('educational', ['contrarian', 'story-arc'])).toEqual([
      'educational',
      'contrarian',
      'story-arc',
    ]);
  });

  it('drops nulls and empty strings', () => {
    expect(buildAllowedSet(null, ['contrarian'])).toEqual(['contrarian']);
    expect(buildAllowedSet('educational', null)).toEqual(['educational']);
    expect(buildAllowedSet(null, null)).toEqual([]);
    expect(buildAllowedSet('', ['contrarian'])).toEqual(['contrarian']);
  });

  it('dedups when suggested also appears in additionals', () => {
    expect(buildAllowedSet('educational', ['educational', 'contrarian'])).toEqual([
      'educational',
      'contrarian',
    ]);
  });

  it('dedups within additionals', () => {
    expect(buildAllowedSet('educational', ['contrarian', 'contrarian', 'story-arc'])).toEqual([
      'educational',
      'contrarian',
      'story-arc',
    ]);
  });
});

describe('selectLeastUsed', () => {
  type U = Map<string, { count: number; lastUsedAt: string | null }>;
  const usage = (entries: Array<[string, number, string | null]>): U =>
    new Map(entries.map(([v, c, t]) => [v, { count: c, lastUsedAt: t }]));

  it('returns null on empty allowed', () => {
    expect(selectLeastUsed([], new Map())).toBeNull();
  });

  it('returns the only allowed value (no DB needed in caller)', () => {
    expect(selectLeastUsed(['educational'], new Map())).toBe('educational');
  });

  it('prefers the lowest usage count', () => {
    const u = usage([
      ['educational', 27, '2026-05-14T00:00:00Z'],
      ['contrarian', 3, '2026-05-13T00:00:00Z'],
    ]);
    expect(selectLeastUsed(['educational', 'contrarian'], u)).toBe('contrarian');
  });

  it('treats values missing from the usage map as count=0', () => {
    // 'contrarian' has no row → it's never been used → must win over the
    // value with a row, even if that value also has count 0.
    const u = usage([['educational', 0, '2026-05-14T00:00:00Z']]);
    expect(selectLeastUsed(['educational', 'contrarian'], u)).toBe('contrarian');
  });

  it('on count tie, picks the oldest lastUsedAt (nulls win)', () => {
    const u = usage([
      ['educational', 5, '2026-05-10T00:00:00Z'],
      ['contrarian', 5, '2026-05-14T00:00:00Z'],
      ['story-arc', 5, null],
    ]);
    expect(selectLeastUsed(['educational', 'contrarian', 'story-arc'], u)).toBe('story-arc');
  });

  it('on count tie + both nulls, preserves allowed[] order (suggested first)', () => {
    const u = new Map<string, { count: number; lastUsedAt: string | null }>();
    expect(selectLeastUsed(['educational', 'contrarian'], u)).toBe('educational');
    // Flipping order flips winner — proves the sort is stable wrt allowed[].
    expect(selectLeastUsed(['contrarian', 'educational'], u)).toBe('contrarian');
  });

  it('handles the realistic over-used-educational scenario', () => {
    // 'educational' has been used 27 times, 'contrarian' has been used 3.
    // Topic allows both → the picker must rotate to 'contrarian' until
    // counts equalize.
    const u = usage([
      ['educational', 27, '2026-05-14T03:45:00Z'],
      ['contrarian', 3, '2026-05-13T20:56:00Z'],
    ]);
    expect(selectLeastUsed(['educational', 'contrarian'], u)).toBe('contrarian');
  });

  it('soft-fails to the first allowed value if usage map is empty (cold start)', () => {
    expect(selectLeastUsed(['educational', 'contrarian'], new Map())).toBe('educational');
  });
});

describe('isWindowOpen', () => {
  const at = (h: number, m: number): Date => {
    const d = new Date('2026-05-14T00:00:00Z');
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  it('open exactly on the target hour', () => {
    expect(isWindowOpen(at(13, 0), [13], 30)).toBe(true);
  });

  it('open within jitter window', () => {
    expect(isWindowOpen(at(13, 25), [13], 30)).toBe(true);
    expect(isWindowOpen(at(12, 35), [13], 30)).toBe(true);
  });

  it('closed outside jitter window', () => {
    expect(isWindowOpen(at(13, 31), [13], 30)).toBe(false);
    expect(isWindowOpen(at(11, 0), [13], 30)).toBe(false);
  });

  it('window straddling midnight works (00:00 ± 30)', () => {
    expect(isWindowOpen(at(23, 45), [0], 30)).toBe(true);
    expect(isWindowOpen(at(0, 15), [0], 30)).toBe(true);
    expect(isWindowOpen(at(22, 0), [0], 30)).toBe(false);
  });

  it('multiple windows: any match opens', () => {
    expect(isWindowOpen(at(20, 0), [9, 14, 20], 15)).toBe(true);
    expect(isWindowOpen(at(17, 0), [9, 14, 20], 15)).toBe(false);
  });
});

describe('effectiveIdempotencyMs', () => {
  const MIN = 60 * 1000;

  it('returns the 30-min floor when jitter is small', () => {
    // 2×0+5 = 5 min → clamped to 30 min floor
    expect(effectiveIdempotencyMs(0)).toBe(30 * MIN);
    // 2×10+5 = 25 min → clamped to 30 min floor
    expect(effectiveIdempotencyMs(10)).toBe(30 * MIN);
    // 2×12+5 = 29 min → still under floor
    expect(effectiveIdempotencyMs(12)).toBe(30 * MIN);
  });

  it('grows past the floor as jitter increases', () => {
    // 2×15+5 = 35 min → over floor, returned as-is
    expect(effectiveIdempotencyMs(15)).toBe(35 * MIN);
    expect(effectiveIdempotencyMs(25)).toBe((25 * 2 + 5) * MIN); // 55 min
    expect(effectiveIdempotencyMs(60)).toBe((60 * 2 + 5) * MIN); // 125 min
  });

  it('covers the full jitter window with safety margin', () => {
    // For any jitter, the idempotency MUST be >= full window (2×jitter).
    // That's the invariant that prevents the May-14 runaway.
    for (const jitter of [0, 5, 10, 15, 25, 30, 45, 60]) {
      const idem = effectiveIdempotencyMs(jitter);
      const fullWindow = jitter * 2 * MIN;
      expect(idem).toBeGreaterThanOrEqual(fullWindow);
    }
  });

  it('the May-14 runaway scenario: jitter=60 must block re-dispatch for full 2h window', () => {
    // The bug: jitter=60 means 2h-wide window, but old idempotency was
    // hardcoded to 15 min. With cron every 10 min, that means ~6 dispatches
    // per window. The fix MUST return at least 2h = 120 min.
    const idem = effectiveIdempotencyMs(60);
    expect(idem).toBeGreaterThanOrEqual(120 * MIN);
  });
});

describe('effectivePostCount24h', () => {
  const now = new Date('2026-05-15T17:00:00Z');

  it('returns the raw count when the window is fresh', () => {
    const resetAt = new Date('2026-05-15T10:00:00Z').toISOString(); // 7h ago
    expect(effectivePostCount24h(2, resetAt, now)).toBe(2);
  });

  it('returns 0 when the window is older than 24h', () => {
    const resetAt = new Date('2026-05-14T10:00:00Z').toISOString(); // 31h ago
    expect(effectivePostCount24h(2, resetAt, now)).toBe(0);
  });

  it('returns the raw count exactly at the 24h boundary', () => {
    const resetAt = new Date('2026-05-14T17:00:00Z').toISOString(); // exactly 24h
    expect(effectivePostCount24h(2, resetAt, now)).toBe(2);
  });

  it('falls back to the raw count when resetAt is null', () => {
    expect(effectivePostCount24h(3, null, now)).toBe(3);
  });

  it('dead-lock scenario: a stale cap must read as 0 so the scheduler unblocks', () => {
    // The bug: post_count_24h is only reset by the publish-time RPC. If the
    // scheduler skips on the cap it never publishes → never resets → the
    // counter is stuck at the cap forever. A >24h-old window MUST read 0.
    const stuck = new Date('2026-05-13T21:00:00Z').toISOString(); // ~44h ago
    expect(effectivePostCount24h(2, stuck, now)).toBe(0);
  });
});
