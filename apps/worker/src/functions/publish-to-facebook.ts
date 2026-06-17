/**
 * publish-to-facebook — Inngest function que sube el video de la Vidriera a una Facebook Page.
 *
 * Trigger: `vidriera/facebook.publish.requested`
 * Payload: { demoId, demoSlug, storagePath, caption, title, igAccountId, reelPermalink }
 *
 * Flujo:
 *   1. load-token      — obtiene el Page access token + graph_page_id (RPC ig_account_get_graph_token)
 *   2. sign-url        — genera una URL firmada de Supabase (Meta descarga el video server-side)
 *   3. publish-video   — POST /{page-id}/videos con la URL firmada
 *   4. log-activity    — registra el resultado en libre-albedrio activity_log
 *   5. cleanup-storage — borra el archivo del bucket
 *
 * El Reel de Instagram ya fue publicado y marcado como promoted ANTES de que
 * este evento se dispare, así que un fallo aquí no afecta a IG ni a LinkedIn.
 *
 * Nota: requiere que la cuenta de IG haya sido reconectada con el scope
 * `pages_manage_posts` (agregado en web/src/lib/instagram-graph.ts).
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { logActivity, libreAlbedrioClient } from '../lib/libre-albedrio.js';
import { publishVideoToFacebookPage, InstagramGraphError } from '../lib/instagram-graph.js';

interface IgTokenRow {
  access_token:  string;
  graph_user_id: string;
  graph_page_id: string;
  ig_username:   string;
  expires_at:    string | null;
}

export const publishToFacebook = inngest.createFunction(
  {
    id:          'publish-to-facebook',
    retries:     2,
    concurrency: { limit: 1 },
  },
  { event: 'vidriera/facebook.publish.requested' },
  async ({ event, step, logger }) => {
    const { demoId, demoSlug, storagePath, caption, title, igAccountId, reelPermalink } =
      event.data;

    // ── 1. load-token ─────────────────────────────────────────────────
    const tokenRow = await step.run('load-token', async () => {
      const vh = getAdminClient();
      const { data: rows, error } = await vh.rpc('ig_account_get_graph_token', {
        p_account_id: igAccountId,
      });
      if (error || !rows || (rows as IgTokenRow[]).length === 0) {
        throw new Error(`ig_token_rpc_failed: ${error?.message ?? 'no token row'}`);
      }
      const row = (rows as IgTokenRow[])[0]!;
      if (!row.graph_page_id) {
        throw new Error('fb_page_id_missing: la cuenta de IG no tiene graph_page_id configurado');
      }
      return row;
    });

    // ── 2. sign-url (Meta descarga el video directamente desde Supabase) ─
    const videoUrl = await step.run('sign-url', async () => {
      const vh = getAdminClient();
      const signed = await vh.storage.from('videos').createSignedUrl(storagePath, 2 * 60 * 60);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error(`sign_failed: ${signed.error?.message ?? 'no url'}`);
      }
      return signed.data.signedUrl;
    });

    // ── 3. publish-video ──────────────────────────────────────────────
    type PublishOk     = { ok: true;  videoId: string; permalink: string | null };
    type PublishFailed = { ok: false; error: string;   authErr: boolean };
    type PublishResult = PublishOk | PublishFailed;

    const publishResult = await step.run('publish-video', async (): Promise<PublishResult> => {
      try {
        const result = await publishVideoToFacebookPage({
          pageId:      tokenRow.graph_page_id,
          accessToken: tokenRow.access_token,
          videoUrl,
          description: caption,
        });
        return { ok: true, videoId: result.videoId, permalink: result.permalink };
      } catch (err) {
        if (err instanceof InstagramGraphError && (err.info.terminal || err.info.authError)) {
          logger.error('facebook.terminal_error', {
            demo:    demoSlug,
            code:    err.info.code,
            message: err.info.message,
          });
          return { ok: false, error: err.info.message, authErr: err.info.authError };
        }
        throw err; // transient: Inngest reintenta
      }
    });

    if (!publishResult.ok) {
      const la = libreAlbedrioClient();
      await logActivity(la, {
        category: 'infra',
        title:    `Vidriera Facebook: error publicando ${demoSlug}`,
        detail:   `Error: ${publishResult.error}${publishResult.authErr ? ' — reconectar la cuenta de IG/Facebook.' : ''}`,
      }).catch(() => {});
      return { published: false, demoId, error: publishResult.error };
    }

    // ── 4. log-activity ───────────────────────────────────────────────
    await step.run('log-activity', async () => {
      const la = libreAlbedrioClient();
      await logActivity(la, {
        category: 'marketing',
        title:    `Vidriera Facebook: video publicado — ${title ?? demoSlug}`,
        detail:
          `Video ${publishResult.videoId} publicado en la Facebook Page (${tokenRow.ig_username}).` +
          (publishResult.permalink  ? ` Permalink: ${publishResult.permalink}`     : '') +
          (reelPermalink ? ` | IG Reel: ${reelPermalink}` : ''),
      });
    });

    // ── 5. cleanup-storage ────────────────────────────────────────────
    await step.run('cleanup-storage', async () => {
      const vh = getAdminClient();
      await vh.storage.from('videos').remove([storagePath]).catch(() => {});
    });

    logger.info('facebook.published', { demo: demoSlug, videoId: publishResult.videoId });
    return {
      published: true,
      demoId,
      demoSlug,
      videoId:   publishResult.videoId,
      permalink: publishResult.permalink,
    };
  },
);
