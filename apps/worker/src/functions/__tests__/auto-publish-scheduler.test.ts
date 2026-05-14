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
