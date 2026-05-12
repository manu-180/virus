/**
 * publish-carousel-to-instagram — Inngest function that publishes a carousel
 * to Instagram via the external Python ig-publisher service on Railway.
 *
 * Trigger: `virus/carousel.publish.requested`
 * Payload: { publicationId, carouselId, igAccountId, userId }
 *
 * Flow:
 *  1. load: fetch the publication row, the carousel, slides, captions, and
 *     verify the IG account belongs to the carousel's owner.
 *  2. mark-publishing: flip ig_publications.status → 'publishing'.
 *  3. signed-urls: create 1h signed URLs for each composed slide image.
 *  4. http: HMAC-sign and POST to {IG_PUBLISHER_URL}/feed/carousel.
 *     The Python service does the actual instagrapi.album_upload call.
 *  5. mark-published or mark-failed:
 *      - success → status='published', store ig_media_id + permalink
 *      - structured error → status='failed', store error
 *
 * Retries: Inngest will retry on thrown errors. For terminal errors
 * (rate_limit, challenge_required, account_disabled, invalid_payload) we
 * intentionally do NOT throw — those persist a `failed` row and the user
 * resolves them in the UI (and Inngest moves on cleanly).
 */

import crypto from 'node:crypto';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

// ---------------------------------------------------------------------------
// Domain row shapes (subset of columns we care about)
// ---------------------------------------------------------------------------

interface IgPublicationRow {
  id: string;
  carousel_id: string;
  ig_account_id: string;
  user_id: string;
  caption: string;
  first_comment: string | null;
  status: string;
  attempts: number;
}

interface SlideRow {
  idx: number;
  composed_path: string | null;
  image_path: string | null;
  status: string;
}

interface IgAccountRow {
  id: string;
  ig_username: string;
  user_id: string;
  status: string;
  deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Errors that are terminal — we record `failed` but do NOT throw, so the
// Inngest run doesn't retry. They match the publisher's error codes.
// ---------------------------------------------------------------------------

const TERMINAL_ERRORS = new Set([
  'invalid_payload',
  'account_not_found',
  'account_disabled',
  'rate_limit_exceeded',
  'challenge_required',
  'image_download_failed', // caused by bad URLs; retrying won't help
]);

// ---------------------------------------------------------------------------
// HMAC-SHA256 of raw body (matches publisher's auth.py)
// ---------------------------------------------------------------------------

function signBody(body: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

export const publishCarouselToInstagram = inngest.createFunction(
  {
    id: 'publish-carousel-to-instagram',
    name: 'Publish carousel to Instagram',
    // Don't queue multiple publishes for the same publication row.
    concurrency: { limit: 1, key: 'event.data.publicationId' },
    retries: 3,
  },
  { event: 'virus/carousel.publish.requested' },
  async ({ event, step, logger }) => {
    const { publicationId, carouselId, igAccountId, userId } = event.data;
    const supabase = getAdminClient();

    // ── 1. load publication + carousel + account ────────────────────────────
    const ctx = await step.run('load-context', async () => {
      const { data: pub, error: pubErr } = await supabase
        .from('ig_publications')
        .select('id, carousel_id, ig_account_id, user_id, caption, first_comment, status, attempts')
        .eq('id', publicationId)
        .single<IgPublicationRow>();

      if (pubErr || !pub) {
        throw new Error(`publication ${publicationId} not found: ${pubErr?.message ?? 'no row'}`);
      }

      // Idempotency guard: once 'published', short-circuit. Once 'cancelled', skip.
      if (pub.status === 'published' || pub.status === 'cancelled') {
        return { pub, slides: [] as SlideRow[], account: null as IgAccountRow | null, shortCircuit: true };
      }

      const { data: account, error: acctErr } = await supabase
        .from('ig_accounts')
        .select('id, ig_username, user_id, status, deleted_at')
        .eq('id', igAccountId)
        .single<IgAccountRow>();

      if (acctErr || !account) {
        throw new Error(`ig_account ${igAccountId} not found: ${acctErr?.message ?? 'no row'}`);
      }

      // Defense in depth: the web route already checked ownership, but verify.
      if (account.user_id !== userId || account.user_id !== pub.user_id) {
        throw new Error('forbidden: account does not belong to publication owner');
      }

      const { data: slides, error: slidesErr } = await supabase
        .from('carousel_slides')
        .select('idx, composed_path, image_path, status')
        .eq('carousel_id', carouselId)
        .order('idx', { ascending: true });

      if (slidesErr) {
        throw new Error(`failed to load slides: ${slidesErr.message}`);
      }

      return { pub, slides: (slides ?? []) as SlideRow[], account, shortCircuit: false };
    });

    if (ctx.shortCircuit) {
      logger.info('publish.short_circuit', { publicationId, status: ctx.pub.status });
      return { status: ctx.pub.status, message: 'publication already in terminal state' };
    }

    // ── 2. mark-publishing ──────────────────────────────────────────────────
    await step.run('mark-publishing', async () => {
      const { error } = await supabase
        .from('ig_publications')
        .update({
          status: 'publishing',
          attempts: (ctx.pub.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', publicationId)
        .in('status', ['queued', 'failed']); // only flip from a non-terminal state
      if (error) {
        throw new Error(`mark-publishing failed: ${error.message}`);
      }
    });

    // ── 3. signed URLs for the composed slides ──────────────────────────────
    const usableSlides = ctx.slides.filter(
      (s) => s.status === 'done' && (s.composed_path || s.image_path),
    );
    if (usableSlides.length < 2) {
      await step.run('mark-failed-insufficient-slides', async () => {
        await supabase
          .from('ig_publications')
          .update({
            status: 'failed',
            error: {
              code: 'invalid_payload',
              message: `need at least 2 ready slides, got ${usableSlides.length}`,
            },
          })
          .eq('id', publicationId);
      });
      logger.warn('publish.insufficient_slides', { publicationId, count: usableSlides.length });
      return { status: 'failed', code: 'invalid_payload', terminal: true };
    }

    const imageUrls = await step.run('sign-image-urls', async () => {
      const urls: string[] = [];
      for (const slide of usableSlides) {
        const path = slide.composed_path ?? slide.image_path!;
        const { data, error } = await supabase.storage
          .from('carousels')
          .createSignedUrl(path, 60 * 60); // 1h
        if (error || !data?.signedUrl) {
          throw new Error(`signed-url failed for slide ${slide.idx}: ${error?.message ?? 'no url'}`);
        }
        urls.push(data.signedUrl);
      }
      return urls;
    });

    // ── 4. HMAC + HTTP POST to the publisher ────────────────────────────────
    const publisherUrl = process.env['IG_PUBLISHER_URL'];
    const hmacSecret = process.env['IG_PUBLISHER_HMAC_SECRET'];
    if (!publisherUrl || !hmacSecret) {
      throw new Error('IG_PUBLISHER_URL and IG_PUBLISHER_HMAC_SECRET must be set');
    }

    const result = await step.run('http-publish', async () => {
      const bodyObj = {
        account_id: igAccountId,
        image_urls: imageUrls,
        caption: ctx.pub.caption,
        first_comment: ctx.pub.first_comment,
        idempotency_key: publicationId,
      };
      const body = JSON.stringify(bodyObj);
      const sig = signBody(body, hmacSecret);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000); // 3min
      try {
        const res = await fetch(`${publisherUrl.replace(/\/$/, '')}/feed/carousel`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-sidecar-signature': sig,
          },
          body,
          signal: controller.signal,
        });
        const text = await res.text();
        let payload: { ig_media_id?: string; ig_permalink?: string | null; error?: string; message?: string };
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { error: 'publisher_invalid_json', message: text.slice(0, 200) };
        }
        if (!res.ok) {
          return { ok: false as const, status: res.status, payload };
        }
        return { ok: true as const, status: res.status, payload };
      } finally {
        clearTimeout(timeout);
      }
    });

    // ── 5. mark-published or mark-failed ────────────────────────────────────
    if (result.ok && result.payload.ig_media_id) {
      await step.run('mark-published', async () => {
        const { error } = await supabase
          .from('ig_publications')
          .update({
            status: 'published',
            ig_media_id: result.payload.ig_media_id,
            ig_permalink: result.payload.ig_permalink ?? null,
            published_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', publicationId);
        if (error) {
          throw new Error(`mark-published failed: ${error.message}`);
        }
      });
      logger.info('publish.success', {
        publicationId,
        igMediaId: result.payload.ig_media_id,
        igPermalink: result.payload.ig_permalink,
      });
      return { status: 'published', mediaId: result.payload.ig_media_id };
    }

    // Failure: classify and persist
    const code = result.payload?.error ?? 'publisher_error';
    const message = result.payload?.message ?? `publisher returned HTTP ${result.status}`;
    const terminal = TERMINAL_ERRORS.has(code) || result.status === 400;

    await step.run('mark-failed', async () => {
      const { error } = await supabase
        .from('ig_publications')
        .update({
          status: 'failed',
          error: { code, message, http_status: result.status },
        })
        .eq('id', publicationId);
      if (error) {
        logger.warn('publish.mark_failed_db_error', { publicationId, error: error.message });
      }
    });

    if (terminal) {
      logger.warn('publish.terminal_error', { publicationId, code, message });
      return { status: 'failed', code, message, terminal: true };
    }

    // Retryable: throw so Inngest retries with backoff
    throw new Error(`publisher transient error: ${code} — ${message}`);
  },
);

