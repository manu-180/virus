// ---------------------------------------------------------------------------
// Style rotation — picks the overlay style for a new carousel so the feed never
// looks monotonous. Reuses the same "least-used, oldest-on-tie" idea the
// scheduler already uses for topic/angle/tone, applied to the style dimension.
//
// The ordering (count ASC → last_used_at ASC → registry order) produces a
// ROUND-ROBIN with maximum spacing: every style is used once before any
// repeats, and after the first cycle the longest-idle style wins. Per project,
// so each brand rotates its own styles independently.
//
// Works from both the worker (service-role client) and the web API route
// (admin client) since both bypass RLS.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import { CAROUSEL_STYLE_KEYS, DEFAULT_STYLE, type CarouselStyleKey } from './styles.js';

export interface StyleUsageRow {
  value: string;
  usage_count: number;
  last_used_at: string | null;
}

/**
 * Pure selection: pick the least-used style with maximum spacing.
 *  1. lowest usage_count first (never-used beats used)
 *  2. on ties, oldest last_used_at first (NULL = never = wins)
 *  3. on full ties, registry order (stable, deterministic first cycle)
 *
 * Exported for unit testing — pure given the usage map.
 */
export function selectLeastUsedStyle(
  allowed: readonly CarouselStyleKey[],
  usage: Map<string, { count: number; lastUsedAt: string | null }>,
): CarouselStyleKey {
  if (allowed.length === 0) return DEFAULT_STYLE;
  const indexed = allowed.map((value, idx) => ({ value, idx }));
  indexed.sort((a, b) => {
    const ua = usage.get(a.value) ?? { count: 0, lastUsedAt: null };
    const ub = usage.get(b.value) ?? { count: 0, lastUsedAt: null };
    if (ua.count !== ub.count) return ua.count - ub.count;
    if (ua.lastUsedAt === null && ub.lastUsedAt !== null) return -1;
    if (ua.lastUsedAt !== null && ub.lastUsedAt === null) return 1;
    if (ua.lastUsedAt !== null && ub.lastUsedAt !== null) {
      const da = new Date(ua.lastUsedAt).getTime();
      const db = new Date(ub.lastUsedAt).getTime();
      if (da !== db) return da - db;
    }
    return a.idx - b.idx;
  });
  return indexed[0]!.value;
}

/**
 * Query usage + pick the next style for a project. Never throws — on any DB
 * error it returns DEFAULT_STYLE so carousel creation always proceeds.
 */
export async function pickRotatingStyle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  projectId: string,
): Promise<CarouselStyleKey> {
  try {
    const { data, error } = await supabase
      .from('carousel_dimension_usage')
      .select('value, usage_count, last_used_at')
      .eq('project_id', projectId)
      .eq('dimension', 'style')
      .in('value', CAROUSEL_STYLE_KEYS as readonly string[]);

    if (error) return DEFAULT_STYLE;

    const usage = new Map<string, { count: number; lastUsedAt: string | null }>();
    for (const row of (data ?? []) as StyleUsageRow[]) {
      usage.set(row.value, { count: row.usage_count, lastUsedAt: row.last_used_at });
    }
    return selectLeastUsedStyle(CAROUSEL_STYLE_KEYS, usage);
  } catch {
    return DEFAULT_STYLE;
  }
}

/**
 * Record that a (dimension, value) was used for `projectId`, advancing that
 * dimension's rotation cursor. Used for 'style' and — in the auto-publish
 * scheduler — also 'angle'/'tone' (the scheduler historically read dimension
 * usage but never wrote it, so auto rotation never advanced). Non-critical:
 * a failure just means the next pick may repeat sooner. Never throws.
 */
export async function bumpCarouselDimension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  projectId: string,
  dimension: string,
  value: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('bump_carousel_dimension', {
      p_project_id: projectId,
      p_dimension: dimension,
      p_value: value,
    });
    if (error) {
      console.warn(
        JSON.stringify({ fn: 'bumpCarouselDimension', dimension, warn: 'rpc_error', error: error.message }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'bumpCarouselDimension',
        dimension,
        warn: 'threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/** Convenience wrapper: bump the 'style' dimension. */
export async function bumpStyleUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  projectId: string,
  style: string,
): Promise<void> {
  return bumpCarouselDimension(supabase, projectId, 'style', style);
}
