/**
 * publish-carousel-to-instagram — Inngest function that publishes a carousel.
 *
 * Trigger: `virus/carousel.publish.requested`
 * Payload: { publicationId, carouselId, igAccountId, userId }
 *
 * The flow auto-detects the account's `auth_type`:
 *   • 'graph_api'  (preferred) → uses Meta's official Graph API, in-process
 *   • 'instagrapi' (legacy)    → relays to the Python publisher on Railway
 *
 * Common pipeline:
 *  1. load: publication + carousel + account + slides
 *  2. mark-publishing: flip ig_publications.status → 'publishing'
 *  3. signed-urls: 1h signed URLs for each composed slide image
 *  4. publish: branch on auth_type
 *  5. mark-published or mark-failed
 *
 * Retries: terminal errors persist `failed` without re-raising (Inngest moves
 * on); transient errors throw so Inngest retries with exponential backoff.
 */

import crypto from 'node:crypto';
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import {
  InstagramGraphError,
  publishCarousel as publishCarouselViaGraph,
} from '../lib/instagram-graph.js';

// ---------------------------------------------------------------------------
// DB row shapes
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
  auth_type: 'instagrapi' | 'graph_api';
  deleted_at: string | null;
}

interface GraphTokenRow {
  access_token: string;
  graph_user_id: string;
  graph_page_id: string;
  ig_username: string;
  expires_at: string | null;
}

interface PublishOutcome {
  ok: boolean;
  mediaId?: string;
  permalink?: string | null;
  errorCode?: string;
  errorMessage?: string;
  /** True = stop retrying; persist `failed` and let the user resolve. */
  terminal?: boolean;
  /** True = token issue; flip the account to `challenge` so the user re-connects. */
  authError?: boolean;
}

// ---------------------------------------------------------------------------
// Legacy instagrapi terminal-error codes (Python service returns these)
// ---------------------------------------------------------------------------

const LEGACY_TERMINAL_ERRORS = new Set([
  'invalid_payload',
  'account_not_found',
  'account_disabled',
  'rate_limit_exceeded',
  'challenge_required',
  'image_download_failed',
]);

// ---------------------------------------------------------------------------
// HMAC helper (legacy path only)
// ---------------------------------------------------------------------------

function signBody(body: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const publishCarouselToInstagram = inngest.createFunction(
  {
    id: 'publish-carousel-to-instagram',
    name: 'Publish carousel to Instagram',
    concurrency: { limit: 1, key: 'event.data.publicationId' },
    retries: 3,
  },
  { event: 'virus/carousel.publish.requested' },
  async ({ event, step, logger }) => {
    const { publicationId, carouselId, igAccountId, userId } = event.data;
    const supabase = getAdminClient();

    // ── 1. load context ─────────────────────────────────────────────────────
    const ctx = await step.run('load-context', async () => {
      const { data: pub, error: pubErr } = await supabase
        .from('ig_publications')
        .select('id, carousel_id, ig_account_id, user_id, caption, first_comment, status, attempts')
        .eq('id', publicationId)
        .single<IgPublicationRow>();

      if (pubErr || !pub) {
        throw new Error(`publication ${publicationId} not found: ${pubErr?.message ?? 'no row'}`);
      }

      if (pub.status === 'published' || pub.status === 'cancelled') {
        return { pub, slides: [] as SlideRow[], account: null as IgAccountRow | null, shortCircuit: true };
      }

      const { data: account, error: acctErr } = await supabase
        .from('ig_accounts')
        .select('id, ig_username, user_id, status, auth_type, deleted_at')
        .eq('id', igAccountId)
        .single<IgAccountRow>();

      if (acctErr || !account) {
        throw new Error(`ig_account ${igAccountId} not found: ${acctErr?.message ?? 'no row'}`);
      }

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

    const account = ctx.account!;

    // ── 2. mark publishing ──────────────────────────────────────────────────
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
        .in('status', ['queued', 'failed']);
      if (error) throw new Error(`mark-publishing failed: ${error.message}`);
    });

    // ── 3. signed URLs for slides ───────────────────────────────────────────
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
          .createSignedUrl(path, 60 * 60);
        if (error || !data?.signedUrl) {
          throw new Error(`signed-url failed for slide ${slide.idx}: ${error?.message ?? 'no url'}`);
        }
        urls.push(data.signedUrl);
      }
      return urls;
    });

    // ── 4. publish (branch on auth_type) ────────────────────────────────────
    let outcome: PublishOutcome;
    if (account.auth_type === 'graph_api') {
      outcome = await step.run('publish-graph', async () => {
        return doGraphPublish(supabase, igAccountId, imageUrls, ctx.pub.caption);
      });
    } else {
      outcome = await step.run('publish-instagrapi', async () => {
        return doInstagrapiPublish(igAccountId, imageUrls, ctx.pub);
      });
    }

    // ── 5. persist outcome ──────────────────────────────────────────────────
    if (outcome.ok) {
      await step.run('mark-published', async () => {
        const { error } = await supabase
          .from('ig_publications')
          .update({
            status: 'published',
            ig_media_id: outcome.mediaId,
            ig_permalink: outcome.permalink ?? null,
            published_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', publicationId);
        if (error) throw new Error(`mark-published failed: ${error.message}`);
      });
      logger.info('publish.success', {
        publicationId,
        mediaId: outcome.mediaId,
        permalink: outcome.permalink,
        authType: account.auth_type,
      });
      return { status: 'published', mediaId: outcome.mediaId };
    }

    // Persist failure
    const code = outcome.errorCode ?? 'publisher_error';
    const message = outcome.errorMessage ?? 'unknown error';
    await step.run('mark-failed', async () => {
      await supabase
        .from('ig_publications')
        .update({ status: 'failed', error: { code, message } })
        .eq('id', publicationId);
    });

    // Token problem → mark the account so the UI shows "reconnect"
    if (outcome.authError) {
      await step.run('mark-account-challenge', async () => {
        await supabase
          .from('ig_accounts')
          .update({ status: 'challenge', last_error: `${code}: ${message}`.slice(0, 500) })
          .eq('id', igAccountId);
      });
      logger.warn('publish.auth_error', { publicationId, code, message });
      return { status: 'failed', code, terminal: true, authError: true };
    }

    if (outcome.terminal) {
      logger.warn('publish.terminal_error', { publicationId, code, message });
      return { status: 'failed', code, message, terminal: true };
    }

    // Transient — throw so Inngest retries
    throw new Error(`publish transient error: ${code} — ${message}`);
  },
);

// ---------------------------------------------------------------------------
// Graph API publish helper
// ---------------------------------------------------------------------------

async function doGraphPublish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  igAccountId: string,
  imageUrls: string[],
  caption: string,
): Promise<PublishOutcome> {
  // Fetch token + ids from the Vault-backed RPC
  const { data: rows, error } = await supabase.rpc('ig_account_get_graph_token', {
    p_account_id: igAccountId,
  });
  if (error || !rows || rows.length === 0) {
    return {
      ok: false,
      errorCode: 'graph_token_not_found',
      errorMessage: error?.message ?? 'no token row',
      terminal: true,
      authError: true,
    };
  }
  const tokenRow = rows[0] as GraphTokenRow;

  try {
    const result = await publishCarouselViaGraph({
      igUserId: tokenRow.graph_user_id,
      accessToken: tokenRow.access_token,
      imageUrls,
      caption,
    });
    return { ok: true, mediaId: result.mediaId, permalink: result.permalink };
  } catch (err) {
    if (err instanceof InstagramGraphError) {
      return {
        ok: false,
        errorCode: err.info.code,
        errorMessage: err.info.message,
        terminal: err.info.terminal,
        authError: err.info.authError,
      };
    }
    return {
      ok: false,
      errorCode: 'graph_unexpected',
      errorMessage: err instanceof Error ? err.message : String(err),
      terminal: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Legacy instagrapi publish helper (HTTP → Python publisher)
// ---------------------------------------------------------------------------

async function doInstagrapiPublish(
  igAccountId: string,
  imageUrls: string[],
  pub: IgPublicationRow,
): Promise<PublishOutcome> {
  const publisherUrl = process.env['IG_PUBLISHER_URL'];
  const hmacSecret = process.env['IG_PUBLISHER_HMAC_SECRET'];
  if (!publisherUrl || !hmacSecret) {
    return {
      ok: false,
      errorCode: 'config_missing',
      errorMessage: 'IG_PUBLISHER_URL and IG_PUBLISHER_HMAC_SECRET must be set for instagrapi accounts',
      terminal: true,
    };
  }

  const bodyObj = {
    account_id: igAccountId,
    image_urls: imageUrls,
    caption: pub.caption,
    first_comment: pub.first_comment,
    idempotency_key: pub.id,
  };
  const body = JSON.stringify(bodyObj);
  const sig = signBody(body, hmacSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
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

    if (res.ok && payload.ig_media_id) {
      return { ok: true, mediaId: payload.ig_media_id, permalink: payload.ig_permalink ?? null };
    }

    const code = payload.error ?? 'publisher_error';
    return {
      ok: false,
      errorCode: code,
      errorMessage: payload.message ?? `publisher HTTP ${res.status}`,
      terminal: LEGACY_TERMINAL_ERRORS.has(code) || res.status === 400,
      authError: code === 'challenge_required',
    };
  } finally {
    clearTimeout(timeout);
  }
}
