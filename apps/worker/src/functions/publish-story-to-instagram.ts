/**
 * publish-story-to-instagram — Inngest function that auto-shares the first
 * slide of a just-published carousel as a 9:16 Instagram Story.
 *
 * Trigger: `virus/carousel.story.publish.requested` (emitted by
 *          publish-carousel-to-instagram after a successful Graph-API publish)
 * Payload: { publicationId, carouselId, igAccountId, userId }
 *
 * Flow:
 *  1. load: ig_publications row + ig_accounts (must be graph_api) + first
 *     ready slide. If `ig_story_media_id` is already set, short-circuit
 *     (idempotency for Inngest retries).
 *  2. compose-story: download first slide from Storage, run it through
 *     composeStoryFromSlide() → 1080x1920 PNG, upload as `story.png`.
 *  3. publish-story: sign URL, fetch Graph token, call publishStory().
 *  4. mark-story-published: persist ig_story_media_id + ig_story_published_at.
 *
 * Failure handling: terminal Graph errors are persisted to `story_error` and
 * the function returns success (don't retry). Transient errors throw so
 * Inngest retries with backoff. After retries exhausted the row keeps its
 * `story_error` and the parent carousel publication is unaffected.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import {
  InstagramGraphError,
  publishStory as publishStoryViaGraph,
} from '../lib/instagram-graph.js';
import {
  composeStoryFromSlide,
  STYLE_PRESETS,
  applyBrandOverrides,
} from '@virus/shared/carousel';
import type { StylePreset } from '@virus/shared/carousel';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

interface IgPublicationRow {
  id: string;
  carousel_id: string;
  ig_account_id: string;
  user_id: string;
  status: string;
  ig_story_media_id: string | null;
}

interface IgAccountRow {
  id: string;
  auth_type: 'instagrapi' | 'graph_api';
  deleted_at: string | null;
}

interface SlideRow {
  idx: number;
  composed_path: string | null;
  image_path: string | null;
  status: string;
}

interface CarouselProjectRow {
  style_preset: string;
  project_id: string;
}

interface BrandVisualStyle {
  textColor?: string;
  bodyColor?: string;
  accentColor?: string;
  backgroundColor?: string;
}

interface GraphTokenRow {
  access_token: string;
  graph_user_id: string;
  graph_page_id: string;
  ig_username: string;
  expires_at: string | null;
}

// Discriminated union for the publish step's return. Annotated explicitly so
// TypeScript keeps the discrimination after the value flows through Inngest's
// step.run (which widens to `{ [x: string]: unknown }` otherwise — that's
// what costs us the .ok narrowing downstream).
type StoryPublishOutcome =
  | { ok: true; mediaId: string; permalink: string | null }
  | {
      ok: false;
      terminal: boolean;
      errorCode: string;
      errorMessage: string;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePreset(presetName: string, visualStyle?: BrandVisualStyle): StylePreset {
  const key = presetName as keyof typeof STYLE_PRESETS;
  const base = STYLE_PRESETS[key] ?? STYLE_PRESETS.bold;
  return applyBrandOverrides(base, visualStyle);
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const publishStoryToInstagram = inngest.createFunction(
  {
    id: 'publish-story-to-instagram',
    name: 'Publish carousel first-slide as Story',
    // Same per-publication concurrency lock as the parent: at most one Story
    // attempt in flight per publication row, so retries can't fight each
    // other if the user re-triggers manually.
    concurrency: { limit: 1, key: 'event.data.publicationId' },
    retries: 2,
  },
  { event: 'virus/carousel.story.publish.requested' },
  async ({ event, step, logger }) => {
    const { publicationId, carouselId, igAccountId, userId } = event.data;
    const supabase = getAdminClient();

    // ── 1. Load context + idempotency check ─────────────────────────────
    const ctx = await step.run('load-context', async () => {
      const { data: pub, error: pubErr } = await supabase
        .from('ig_publications')
        .select('id, carousel_id, ig_account_id, user_id, status, ig_story_media_id')
        .eq('id', publicationId)
        .single<IgPublicationRow>();

      if (pubErr || !pub) {
        throw new Error(`publication ${publicationId} not found: ${pubErr?.message ?? 'no row'}`);
      }

      // The parent must have actually published — Story without a feed post
      // would be confusing ("mirá el post" → no post). If status drifted
      // (cancelled, failed) we silently bail.
      if (pub.status !== 'published') {
        return { pub, account: null, slide: null, preset: null, skip: 'parent_not_published' as const };
      }

      // Idempotency — Inngest may retry this function; never re-publish.
      if (pub.ig_story_media_id) {
        return { pub, account: null, slide: null, preset: null, skip: 'already_published' as const };
      }

      const { data: account, error: acctErr } = await supabase
        .from('ig_accounts')
        .select('id, auth_type, deleted_at')
        .eq('id', igAccountId)
        .single<IgAccountRow>();

      if (acctErr || !account) {
        throw new Error(`ig_account ${igAccountId} not found: ${acctErr?.message ?? 'no row'}`);
      }

      // Stories publishing currently only supports the Graph API path. The
      // legacy instagrapi publisher on Railway doesn't expose a Stories
      // endpoint, and we don't want to extend that surface — the legacy
      // accounts get the carousel without the bonus Story.
      if (account.auth_type !== 'graph_api') {
        return { pub, account, slide: null, preset: null, skip: 'not_graph_api' as const };
      }

      // First ready slide — same predicate as the carousel publish flow.
      const { data: slides, error: slidesErr } = await supabase
        .from('carousel_slides')
        .select('idx, composed_path, image_path, status')
        .eq('carousel_id', carouselId)
        .order('idx', { ascending: true });

      if (slidesErr) {
        throw new Error(`failed to load slides: ${slidesErr.message}`);
      }

      const firstReady = ((slides ?? []) as SlideRow[]).find(
        (s) =>
          (s.status === 'ready' || s.status === 'done') &&
          (s.composed_path || s.image_path),
      );

      if (!firstReady) {
        return { pub, account, slide: null, preset: null, skip: 'no_ready_slide' as const };
      }

      // Style preset → for the CTA accent color in the story composition
      const { data: carouselRow, error: carouselErr } = await supabase
        .from('carousel_projects')
        .select('style_preset, project_id')
        .eq('id', carouselId)
        .single<CarouselProjectRow>();

      if (carouselErr || !carouselRow) {
        throw new Error(`carousel_not_found:${carouselId}`);
      }

      const { data: brandRow } = await supabase
        .from('project_brand')
        .select('visual_style')
        .eq('project_id', carouselRow.project_id)
        .eq('is_current', true)
        .single();

      const visualStyle = (brandRow?.visual_style as BrandVisualStyle | null) ?? undefined;
      const preset = resolvePreset(carouselRow.style_preset, visualStyle);

      return { pub, account, slide: firstReady, preset, skip: null as null | string };
    });

    if (ctx.skip) {
      logger.info('publish-story.skip', { publicationId, reason: ctx.skip });
      return { status: 'skipped', reason: ctx.skip };
    }

    const firstSlide = ctx.slide!;
    const preset = ctx.preset!;

    // ── 2. Compose the 9:16 story image and upload it ───────────────────
    const storyPath = await step.run('compose-story', async () => {
      const sourcePath = firstSlide.composed_path ?? firstSlide.image_path!;

      const { data: blob, error: dlErr } = await supabase.storage
        .from('carousels')
        .download(sourcePath);

      if (dlErr || !blob) {
        throw new Error(`download_failed:${sourcePath} — ${dlErr?.message ?? 'no data'}`);
      }

      const slideBuffer = Buffer.from(await blob.arrayBuffer());

      const storyBuffer = await composeStoryFromSlide({
        slideImage: slideBuffer,
        preset,
      });

      const path = `${userId}/${carouselId}/story.png`;
      const { error: uploadErr } = await supabase.storage
        .from('carousels')
        .upload(path, storyBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`upload_failed:${path} — ${uploadErr.message}`);
      }

      logger.info('publish-story.composed', {
        publicationId,
        path,
        bytes: storyBuffer.length,
      });

      return path;
    });

    // ── 3. Publish via Graph API ────────────────────────────────────────
    const publishResult: StoryPublishOutcome = await step.run('publish-story', async (): Promise<StoryPublishOutcome> => {
      const { data: signed, error: sigErr } = await supabase.storage
        .from('carousels')
        .createSignedUrl(storyPath, 60 * 60);

      if (sigErr || !signed?.signedUrl) {
        throw new Error(`signed_url_failed:${storyPath} — ${sigErr?.message ?? 'no url'}`);
      }

      const { data: tokenRows, error: tokenErr } = await supabase.rpc(
        'ig_account_get_graph_token',
        { p_account_id: igAccountId },
      );

      if (tokenErr || !tokenRows || tokenRows.length === 0) {
        return {
          ok: false as const,
          terminal: true,
          errorCode: 'graph_token_not_found',
          errorMessage: tokenErr?.message ?? 'no token row',
        };
      }

      const tokenRow = tokenRows[0] as GraphTokenRow;

      try {
        const result = await publishStoryViaGraph({
          igUserId: tokenRow.graph_user_id,
          accessToken: tokenRow.access_token,
          imageUrl: signed.signedUrl,
        });
        return {
          ok: true as const,
          mediaId: result.mediaId,
          permalink: result.permalink,
        };
      } catch (err) {
        if (err instanceof InstagramGraphError) {
          return {
            ok: false as const,
            terminal: err.info.terminal,
            errorCode: err.info.code,
            errorMessage: err.info.message,
          };
        }
        return {
          ok: false as const,
          terminal: false,
          errorCode: 'story_unexpected',
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // ── 4. Persist outcome ──────────────────────────────────────────────
    if (publishResult.ok) {
      await step.run('mark-story-published', async () => {
        const { error } = await supabase
          .from('ig_publications')
          .update({
            ig_story_media_id: publishResult.mediaId,
            ig_story_published_at: new Date().toISOString(),
            story_error: null,
          })
          .eq('id', publicationId);
        if (error) throw new Error(`mark_story_published_failed: ${error.message}`);
      });

      logger.info('publish-story.success', {
        publicationId,
        mediaId: publishResult.mediaId,
        permalink: publishResult.permalink,
      });
      return { status: 'published', mediaId: publishResult.mediaId };
    }

    // Persist the error regardless of whether we'll retry — so observability
    // surfaces the latest failure reason even mid-retry-loop.
    await step.run('persist-story-error', async () => {
      await supabase
        .from('ig_publications')
        .update({
          story_error: {
            code: publishResult.errorCode,
            message: publishResult.errorMessage,
          },
        })
        .eq('id', publicationId);
    });

    if (publishResult.terminal) {
      logger.warn('publish-story.terminal_error', {
        publicationId,
        code: publishResult.errorCode,
        message: publishResult.errorMessage,
      });
      return {
        status: 'failed',
        code: publishResult.errorCode,
        message: publishResult.errorMessage,
        terminal: true,
      };
    }

    // Transient — throw so Inngest retries with backoff.
    throw new Error(
      `publish_story_transient: ${publishResult.errorCode} — ${publishResult.errorMessage}`,
    );
  },
);
