/**
 * image-recycle — emergency fallback that re-uses an already-generated slide
 * image from a previous carousel of the same project, role, and style preset.
 *
 * Why this exists: the per-slide reuse engine in `image-library.ts` requires a
 * Gemini embedding lookup. When the Google AI billing balance is exhausted
 * (or any other Gemini-side failure), that path is unusable AND the fresh
 * generation path in `image-provider.ts` also fails (CarouselRateLimitError).
 * The whole pipeline then dies with `all_slides_failed`, even though the
 * project has dozens of perfectly good past slide images sitting in Storage.
 *
 * This module is the dumb safety net: pick ANY past slide with matching
 * (project_id, role, style_preset) and copy its PNG into the new slide path.
 * No embedding required, no Gemini call. Visual variety degrades — carousels
 * may end up re-using the same hook image as a previous one — but the
 * pipeline ships instead of failing.
 *
 * Triggering rules (see `image-provider.ts`):
 *   1. Try Gemini first (normal path, fresh image).
 *   2. On CarouselRateLimitError, attempt recycle as a last resort.
 *   3. Only if recycle also returns nothing, the slide truly fails.
 *
 * When Gemini billing is recharged this path stays dormant — Gemini succeeds
 * on step 1 and we never reach step 2.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SlideSpec } from './types.js';

export interface FindRecyclableSlideArgs {
  supabase: SupabaseClient;
  projectId: string;
  role: SlideSpec['role'];
  stylePreset: string;
  /** Avoid picking a slide from the carousel currently being generated. */
  excludeCarouselId?: string;
}

export interface RecyclableSlide {
  /** Storage path of the source slide PNG (inside the `carousels` bucket). */
  imagePath: string;
  /** Source carousel id (for observability — not used by the copy). */
  sourceCarouselId: string;
  /** Source slide idx within its carousel. */
  sourceIdx: number;
}

interface CarouselRow {
  id: string;
  style_preset: string;
}

interface SlideRow {
  carousel_id: string;
  idx: number;
  image_path: string;
  overlay_text: string | null;
}

/**
 * Find a past slide image suitable for recycling into a new carousel slot.
 *
 * Filters:
 *  - same project_id (no cross-brand leaks)
 *  - same style_preset (so the look matches the new carousel's text overlay)
 *  - status='ready' (the slide was fully baked)
 *  - image_path IS NOT NULL (the PNG actually exists in Storage)
 *  - role matches (parsed from overlay_text JSON)
 *  - carousel is not soft-deleted
 *  - source carousel != current carousel (the new one in progress)
 *
 * Returns the first match in random order, or null when no candidate exists.
 * Never throws — a query failure resolves to null so the caller can fall
 * through to its own error handling.
 */
export async function findRecyclableSlide(
  args: FindRecyclableSlideArgs,
): Promise<RecyclableSlide | null> {
  const { supabase, projectId, role, stylePreset, excludeCarouselId } = args;

  if (!projectId || !role || !stylePreset) return null;

  try {
    // Step 1: collect candidate carousels for the project + style.
    // We do this in two steps because the supabase-js join syntax for
    // filtering on the joined table varies by version, and the two-step
    // version is unambiguous and robust.
    const { data: carouselRows, error: carouselErr } = await supabase
      .from('carousel_projects')
      .select('id, style_preset')
      .eq('project_id', projectId)
      .eq('style_preset', stylePreset)
      .is('deleted_at', null)
      .limit(200);

    if (carouselErr || !carouselRows || carouselRows.length === 0) {
      if (carouselErr) {
        console.warn(
          JSON.stringify({
            fn: 'findRecyclableSlide',
            warn: 'carousels_query_failed',
            error: carouselErr.message,
          }),
        );
      }
      return null;
    }

    const carouselIds = (carouselRows as CarouselRow[])
      .map((c) => c.id)
      .filter((id) => id !== excludeCarouselId);

    if (carouselIds.length === 0) return null;

    // Step 2: pull the slides for those carousels in one batched query.
    const { data: slideRows, error: slideErr } = await supabase
      .from('carousel_slides')
      .select('carousel_id, idx, image_path, overlay_text')
      .in('carousel_id', carouselIds)
      .eq('status', 'ready')
      .not('image_path', 'is', null)
      .limit(500);

    if (slideErr || !slideRows) {
      if (slideErr) {
        console.warn(
          JSON.stringify({
            fn: 'findRecyclableSlide',
            warn: 'slides_query_failed',
            error: slideErr.message,
          }),
        );
      }
      return null;
    }

    // Step 3: filter by role (encoded inside overlay_text JSON).
    const candidates: RecyclableSlide[] = [];
    for (const row of slideRows as SlideRow[]) {
      if (!row.image_path) continue;
      if (!row.overlay_text) continue;
      try {
        const overlay = JSON.parse(row.overlay_text) as { role?: string };
        if (overlay.role !== role) continue;
        candidates.push({
          imagePath: row.image_path,
          sourceCarouselId: row.carousel_id,
          sourceIdx: row.idx,
        });
      } catch {
        // Skip rows with malformed overlay_text — they'd never have been
        // composed successfully anyway.
        continue;
      }
    }

    if (candidates.length === 0) return null;

    // Pick a random candidate. We don't track cooldown here on purpose —
    // this is the emergency path, simpler is safer. Visual variety can
    // degrade for a few carousels until Gemini is back.
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return pick ?? null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'findRecyclableSlide',
        warn: 'lookup_threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

export interface CopyRecycledSlideArgs {
  supabase: SupabaseClient;
  /** Source storage path inside the `carousels` bucket. */
  sourcePath: string;
  /** Destination storage path inside the `carousels` bucket. */
  destPath: string;
}

export interface CopyRecycledSlideResult {
  bytes: number;
  buffer: Buffer;
}

/**
 * Copy a past slide PNG to the new slide path.
 *
 * Uses download+upload (rather than the Storage `copy()` RPC) because that
 * also gives us the raw bytes back — which the batch pipeline still uses to
 * compute size + propagate buffers for the anchor-chain strategy.
 */
export async function copyRecycledSlide(
  args: CopyRecycledSlideArgs,
): Promise<CopyRecycledSlideResult> {
  const { supabase, sourcePath, destPath } = args;

  const { data: blob, error: dlErr } = await supabase.storage
    .from('carousels')
    .download(sourcePath);

  if (dlErr || !blob) {
    throw new Error(
      `recycle_download_failed:${sourcePath} — ${dlErr?.message ?? 'no data'}`,
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from('carousels')
    .upload(destPath, buffer, { contentType: 'image/png', upsert: true });

  if (upErr) {
    throw new Error(`recycle_upload_failed:${destPath} — ${upErr.message}`);
  }

  return { bytes: buffer.length, buffer };
}
