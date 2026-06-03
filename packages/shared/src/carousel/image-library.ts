/**
 * Carousel image asset library — reuse engine.
 *
 * Every base slide image (the picture BEFORE the text overlay is composited)
 * is, after generation, copied into a permanent per-project location and
 * indexed in `carousel_image_assets` with a semantic embedding. When a later
 * carousel plans a slide whose meaning is close enough to a stored image —
 * same project, same slide role, same brand visual style — that image is
 * reused instead of paying Gemini to generate a near-duplicate.
 *
 * Design rules that keep a reused image *meaningful*:
 *  - Scoped to ONE project: imagery never leaks across brands.
 *  - Scoped to a style fingerprint: a brand restyle invalidates old imagery.
 *  - Scoped to the slide role: a `hook` image is only reused as a `hook`.
 *  - Ranked by a cosine-similarity embedding of role + topic + headline +
 *    visual prompt, so the picture genuinely matches what the slide says.
 *  - A cooldown stops the same image showing up in back-to-back carousels.
 *
 * Reuse only applies to brands whose imageProfile `subjectStrategy` is
 * `world-anchor` or `standalone` (independent slides). `character-anchor`
 * carousels chain every slide to a per-carousel anchor, so cross-carousel
 * reuse would break visual continuity — those images are never indexed.
 *
 * Every function here is defensive: a failure (missing key, API error, DB
 * hiccup) degrades to "no reuse / no save" and the normal generation path
 * continues. The library is an optimization, never a hard dependency.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedText } from '../visuals/providers/gemini-embedding.js';
import type { ProjectBrand } from '../viral/types.js';
import type { SlideSpec } from './types.js';

const CAROUSELS_BUCKET = 'carousels';

// ---------------------------------------------------------------------------
// Config — env-tunable, with safe defaults
// ---------------------------------------------------------------------------

export interface ReuseConfig {
  /** Master switch. `CAROUSEL_IMAGE_REUSE=false` disables the whole feature. */
  enabled: boolean;
  /** Minimum cosine similarity (0..1) to accept a stored image as a match. */
  threshold: number;
  /** Days an image must rest before it can be reused again. */
  cooldownDays: number;
}

function envNumber(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Read reuse configuration from the environment. */
export function getReuseConfig(): ReuseConfig {
  const enabled =
    (process.env['CAROUSEL_IMAGE_REUSE'] ?? 'true').toLowerCase().trim() !== 'false';
  const threshold = clamp(
    envNumber(process.env['CAROUSEL_IMAGE_REUSE_THRESHOLD'], 0.82),
    0.5,
    0.99,
  );
  const cooldownDays = Math.max(
    0,
    Math.round(envNumber(process.env['CAROUSEL_IMAGE_REUSE_COOLDOWN_DAYS'], 7)),
  );
  return { enabled, threshold, cooldownDays };
}

// ---------------------------------------------------------------------------
// Pure helpers — categorization & fingerprinting
// ---------------------------------------------------------------------------

/**
 * Whether a brand's image strategy produces independently-reusable slides.
 *
 * `character-anchor` chains every slide to a per-carousel anchor image, so its
 * slides are NOT safely reusable across carousels — they only make sense next
 * to their own anchor. `world-anchor` / `standalone` slides are each fully
 * described by their own prompt, so they travel well.
 */
export function isReusableStrategy(brand: ProjectBrand): boolean {
  const strategy = brand.visualStyle?.imageProfile?.subjectStrategy ?? 'character-anchor';
  return strategy === 'world-anchor' || strategy === 'standalone';
}

/** The image medium for a brand (photo / 3d / flat illustration / ...). */
export function resolveImageMode(brand: ProjectBrand): string {
  return brand.visualStyle?.imageProfile?.mode ?? 'photo';
}

/**
 * A stable 16-char hash of everything about a brand that changes how its
 * generated images LOOK. Two carousels only share imagery if their brand
 * still hashes to the same fingerprint — so restyling a brand cleanly
 * partitions old imagery away from new.
 */
export function computeStyleFingerprint(brand: ProjectBrand): string {
  const vs = brand.visualStyle;
  const p = vs?.imageProfile;
  const parts = [
    p?.mode ?? 'legacy',
    p?.technique ?? '',
    p?.composition ?? '',
    (p?.moodKeywords ?? []).join(','),
    p?.subjectStrategy ?? 'character-anchor',
    (p?.negativeVisuals ?? []).join(','),
    vs?.accentColor ?? '',
    vs?.secondaryAccent ?? '',
    vs?.backgroundColor ?? '',
    vs?.vibe ?? '',
    vs?.defaultPreset ?? '',
  ];
  return createHash('sha1').update(parts.join('|').toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * The exact text an image is embedded from. Combines what the slide SAYS
 * (role + headline) with what the slide should SHOW (visual prompt) plus the
 * carousel topic as a scene anchor. Used identically when storing an image
 * and when querying for one, so the comparison is symmetric.
 */
export function buildAssetMatchText(slide: SlideSpec, topic: string): string {
  return [
    `role: ${slide.role}`,
    topic.trim() ? `topic: ${topic.trim()}` : '',
    slide.headline.trim() ? `headline: ${slide.headline.trim()}` : '',
    `scene: ${slide.visualPrompt.trim()}`,
  ]
    .filter(Boolean)
    .join('. ');
}

// Common English words stripped from the visual prompt before deriving tags.
// The image model is English-trained so visual prompts are English.
const TAG_STOPWORDS = new Set([
  'the', 'and', 'with', 'from', 'into', 'onto', 'over', 'under', 'this', 'that',
  'these', 'those', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'as', 'by',
  'or', 'is', 'are', 'be', 'it', 'its', 'their', 'has', 'have', 'same', 'very',
  'more', 'most', 'some', 'any', 'each', 'one', 'two', 'new', 'all', 'no', 'not',
  'background', 'image', 'shot', 'view', 'style', 'render', 'rendering', 'scene',
  'showing', 'shown', 'looking', 'mid', 'space', 'subject', 'composition',
]);

/**
 * Derive coarse subject tags from a visual prompt. Deterministic, no API call.
 * These power the GIN-indexed `tags` column for fast filtering and give the
 * library a human-readable categorization next to the embedding.
 */
export function extractSubjectTags(visualPrompt: string): string[] {
  const words = visualPrompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !TAG_STOPWORDS.has(w));

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    tags.push(w);
    if (tags.length >= 10) break;
  }
  return tags;
}

/** Library storage path for an asset: `library/{project}/{role}/{id}.png`. */
export function libraryAssetPath(projectId: string, role: string, assetId: string): string {
  return `library/${projectId}/${role}/${assetId}.png`;
}

// ---------------------------------------------------------------------------
// Reuse lookup
// ---------------------------------------------------------------------------

export interface ReuseMatch {
  assetId: string;
  storagePath: string;
  similarity: number;
}

export interface FindReusableArgs {
  supabase: SupabaseClient;
  projectId: string;
  brand: ProjectBrand;
  slide: SlideSpec;
  topic: string;
  config: ReuseConfig;
}

interface MatchRow {
  id: string;
  storage_path: string;
  similarity: number;
}

/**
 * Find the best reusable image for a slide, or `null` if none qualifies.
 *
 * Never throws — any failure (no API key, embedding error, DB error) resolves
 * to `null` so the caller falls through to fresh generation.
 */
export async function findReusableSlideImage(
  args: FindReusableArgs,
): Promise<ReuseMatch | null> {
  const { supabase, projectId, brand, slide, topic, config } = args;

  if (!config.enabled || !projectId || !isReusableStrategy(brand)) return null;

  try {
    const matchText = buildAssetMatchText(slide, topic);
    const embedding = await embedText(matchText);

    const { data, error } = await supabase.rpc('match_carousel_image_assets', {
      p_project_id: projectId,
      p_role: slide.role,
      p_style_fingerprint: computeStyleFingerprint(brand),
      p_embedding: JSON.stringify(embedding),
      p_threshold: config.threshold,
      p_cooldown_days: config.cooldownDays,
      p_limit: 5,
    });

    if (error) {
      console.warn(
        JSON.stringify({ fn: 'findReusableSlideImage', warn: 'rpc_error', error: error.message }),
      );
      return null;
    }

    const rows = (data as MatchRow[] | null) ?? [];
    const best = rows[0];
    if (!best) return null;

    return {
      assetId: best.id,
      storagePath: best.storage_path,
      similarity: best.similarity,
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'findReusableSlideImage',
        warn: 'lookup_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reuse a stored image into a carousel slide
// ---------------------------------------------------------------------------

export interface ReuseSlideImageArgs {
  supabase: SupabaseClient;
  assetId: string;
  /** Library path of the stored base image. */
  sourcePath: string;
  /** Destination path inside the carousel: `{user}/{carousel}/slide-{idx}.png`. */
  destPath: string;
}

export interface ReuseSlideImageResult {
  bytes: number;
  buffer: Buffer;
}

/**
 * Copy a stored library image into a carousel's slide path and bump the
 * asset's usage counters. Throws on a hard storage failure so the caller can
 * fall back to fresh generation.
 */
export async function reuseSlideImage(
  args: ReuseSlideImageArgs,
): Promise<ReuseSlideImageResult> {
  const { supabase, assetId, sourcePath, destPath } = args;

  const { data: blob, error: dlErr } = await supabase.storage
    .from(CAROUSELS_BUCKET)
    .download(sourcePath);

  if (dlErr || !blob) {
    throw new Error(`reuse_download_failed:${sourcePath} — ${dlErr?.message ?? 'no data'}`);
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(CAROUSELS_BUCKET)
    .upload(destPath, buffer, { contentType: 'image/png', upsert: true });

  if (upErr) {
    throw new Error(`reuse_upload_failed:${destPath} — ${upErr.message}`);
  }

  // Non-fatal: counters are for cooldown/analytics, not correctness.
  try {
    const { error: touchErr } = await supabase.rpc('touch_carousel_image_asset', {
      p_id: assetId,
    });
    if (touchErr) {
      console.warn(
        JSON.stringify({ fn: 'reuseSlideImage', warn: 'touch_failed', error: touchErr.message }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'reuseSlideImage',
        warn: 'touch_threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { bytes: buffer.length, buffer };
}

// ---------------------------------------------------------------------------
// Save a freshly-generated image into the library
// ---------------------------------------------------------------------------

export interface SaveSlideImageAssetArgs {
  supabase: SupabaseClient;
  projectId: string;
  brand: ProjectBrand;
  slide: SlideSpec;
  topic: string;
  carouselId: string;
  /** Path of the just-uploaded base image inside the carousel folder. */
  sourcePath: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Index a freshly-generated base image into the reusable library.
 *
 * Copies the image to a permanent `library/...` path (decoupled from the
 * carousel that produced it, which may later be deleted), embeds its
 * match-text, and inserts the catalog row.
 *
 * Never throws — a save failure just means this image won't be reusable
 * later; the carousel itself is unaffected.
 */
export async function saveSlideImageAsset(
  args: SaveSlideImageAssetArgs,
): Promise<void> {
  const { supabase, projectId, brand, slide, topic, carouselId, sourcePath, bytes, width, height } =
    args;

  if (!projectId || !isReusableStrategy(brand)) return;

  try {
    const assetId = randomUUID();
    const libraryPath = libraryAssetPath(projectId, slide.role, assetId);

    // Permanent copy — survives deletion of the source carousel.
    const { error: copyErr } = await supabase.storage
      .from(CAROUSELS_BUCKET)
      .copy(sourcePath, libraryPath);

    if (copyErr) {
      console.warn(
        JSON.stringify({ fn: 'saveSlideImageAsset', warn: 'copy_failed', error: copyErr.message }),
      );
      return;
    }

    const matchText = buildAssetMatchText(slide, topic);
    const mode = resolveImageMode(brand);

    // Embedding is an optimization — failures must NOT block the insert.
    // A row without an embedding won't be matched by match_carousel_image_assets
    // (it filters `embedding IS NOT NULL`), but the image is still catalogued and
    // can be backfilled later once the embedding API is healthy.
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(matchText);
    } catch (embErr) {
      console.warn(
        JSON.stringify({
          fn: 'saveSlideImageAsset',
          warn: 'embed_failed',
          carouselId,
          role: slide.role,
          error: embErr instanceof Error ? embErr.message : String(embErr),
        }),
      );
    }

    const { error: insertErr } = await supabase.from('carousel_image_assets').insert({
      id: assetId,
      project_id: projectId,
      storage_path: libraryPath,
      role: slide.role,
      mode,
      subject_strategy: brand.visualStyle?.imageProfile?.subjectStrategy ?? 'standalone',
      style_fingerprint: computeStyleFingerprint(brand),
      category: mode,
      tags: extractSubjectTags(slide.visualPrompt),
      topic: topic.trim(),
      headline: slide.headline.trim(),
      visual_prompt: slide.visualPrompt.trim(),
      match_text: matchText,
      ...(embedding !== null ? { embedding: JSON.stringify(embedding) } : {}),
      width,
      height,
      bytes,
      source_carousel_id: carouselId,
      source_slide_idx: slide.idx,
    });

    if (insertErr) {
      console.warn(
        JSON.stringify({
          fn: 'saveSlideImageAsset',
          warn: 'insert_failed',
          error: insertErr.message,
        }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        fn: 'saveSlideImageAsset',
        warn: 'save_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
