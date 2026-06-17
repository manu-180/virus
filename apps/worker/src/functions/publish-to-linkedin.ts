/**
 * publish-to-linkedin — Inngest function que sube el video de la Vidriera a LinkedIn.
 *
 * Trigger: `vidriera/linkedin.publish.requested`
 * Payload: { demoId, demoSlug, storagePath, caption, title, liAccountId, reelPermalink }
 *
 * Flujo:
 *   1. load-token  — obtiene el access token de LinkedIn (Vault-backed RPC)
 *   2. download    — descarga el video desde Supabase storage
 *   3. publish     — sube a LinkedIn (init → upload → finalize → wait → post)
 *   4. log         — registra el resultado en libre-albedrio activity_log
 *   5. cleanup     — borra el archivo de storage (li-específico)
 *
 * Errors:
 *   - terminal (auth, 403, formato): persiste como failed, no reintenta
 *   - transient (timeout, network): throw para que Inngest reintente
 *
 * El Reel de Instagram ya fue publicado y marcado como promoted ANTES de
 * que este evento se dispare, así que un fallo aquí no afecta a IG.
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { logActivity, libreAlbedrioClient } from '../lib/libre-albedrio.js';
import { publishVideo, LinkedInApiError } from '../lib/linkedin-api.js';

interface LiTokenRow {
  access_token:  string;
  li_person_urn: string;
  li_username:   string;
  expires_at:    string | null;
}

export const publishToLinkedIn = inngest.createFunction(
  {
    id:          'publish-to-linkedin',
    retries:     2, // 3 intentos totales (1 original + 2 retries)
    concurrency: { limit: 1 }, // LinkedIn limita publicaciones paralelas
  },
  { event: 'vidriera/linkedin.publish.requested' },
  async ({ event, step, logger }) => {
    const { demoId, demoSlug, storagePath, caption, title, liAccountId, reelPermalink } = event.data;

    // ── 1. load-token ─────────────────────────────────────────────────
    const tokenRow = await step.run('load-token', async () => {
      const vh = getAdminClient();
      const { data: rows, error } = await vh.rpc('li_account_get_token', {
        p_account_id: liAccountId,
      });
      if (error || !rows || (rows as LiTokenRow[]).length === 0) {
        throw new Error(`li_token_rpc_failed: ${error?.message ?? 'no token row'}`);
      }
      const row = (rows as LiTokenRow[])[0]!;
      // Verificar que el token no está vencido
      if (row.expires_at) {
        const exp = new Date(row.expires_at).getTime();
        if (exp < Date.now()) {
          throw new Error('li_token_expired: reconectar la cuenta de LinkedIn desde Settings');
        }
      }
      return row;
    });

    // ── 2. download ───────────────────────────────────────────────────
    // Inngest serializa los resultados de step.run() via JSON, por lo que
    // un Buffer se serializa como {type:"Buffer",data:number[]}. Usamos
    // base64 para transferir el binario entre steps sin pérdida.
    const videoBase64 = await step.run('download-video', async () => {
      const vh = getAdminClient();
      const { data, error } = await vh.storage
        .from('videos')
        .download(storagePath);

      if (error || !data) {
        throw new Error(`video_download_failed: ${error?.message ?? 'no data'}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    });
    const videoBuffer = Buffer.from(videoBase64, 'base64');

    // ── 3. publish ────────────────────────────────────────────────────
    type PublishOk      = { ok: true;  postUrn: string; permalink: string | null };
    type PublishFailed  = { ok: false; error: string; authErr: boolean };
    type PublishResult  = PublishOk | PublishFailed;

    const publishResult = await step.run('publish-video', async (): Promise<PublishResult> => {
      try {
        const result = await publishVideo({
          accessToken:  tokenRow.access_token,
          personUrn:    tokenRow.li_person_urn,
          videoBuffer,
          caption,
          ...(title ? { title } : {}),
        });
        return { ok: true, postUrn: result.postUrn, permalink: result.permalink };
      } catch (err) {
        if (err instanceof LinkedInApiError && (err.info.terminal || err.info.authError)) {
          logger.error('linkedin.terminal_error', {
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
        title:    `Vidriera LinkedIn: error publicando ${demoSlug}`,
        detail:   `Error: ${publishResult.error}${publishResult.authErr ? ' — reconectar la cuenta LinkedIn.' : ''}`,
      }).catch(() => {});
      return { published: false, demoId, error: publishResult.error };
    }

    const permalink = publishResult.permalink;
    const postUrn   = publishResult.postUrn;

    // ── 4. log ────────────────────────────────────────────────────────
    await step.run('log-activity', async () => {
      const la = libreAlbedrioClient();
      await logActivity(la, {
        category: 'marketing',
        title:    `Vidriera LinkedIn: video publicado — ${title ?? demoSlug}`,
        detail:
          `Post ${postUrn} publicado en LinkedIn (${tokenRow.li_username}).` +
          (permalink  ? ` Permalink: ${permalink}`     : '') +
          (reelPermalink ? ` | IG Reel: ${reelPermalink}` : ''),
      });
    });

    // ── 5. cleanup ────────────────────────────────────────────────────
    await step.run('cleanup-storage', async () => {
      const vh = getAdminClient();
      await vh.storage.from('videos').remove([storagePath]).catch(() => {});
    });

    logger.info('linkedin.published', { demo: demoSlug, postUrn, permalink });
    return { published: true, demoId, demoSlug, postUrn, permalink };
  },
);
