/**
 * publish-to-youtube — Inngest function que sube el video de la Vidriera como YouTube Short.
 *
 * Trigger: `vidriera/youtube.publish.requested`
 * Payload: { demoId, demoSlug, storagePath, caption, title, ytAccountId, reelPermalink }
 *
 * Flujo:
 *   1. ensure-fresh-token — carga el token de yt_accounts; si expiró (<5 min) lo renueva
 *      con el refresh_token y actualiza la DB para la próxima vez.
 *   2. publish-video      — descarga el video de Supabase y lo sube a YouTube
 *      (init upload URL → PUT bytes). Dentro de un único step para evitar
 *      serialización base64 del Buffer entre steps.
 *   3. log-activity       — registra en libre-albedrio activity_log
 *   4. cleanup-storage    — borra el archivo del bucket
 *
 * El Reel de IG + el video de LinkedIn/Facebook ya están publicados antes de
 * que este evento se dispare. Un fallo aquí no afecta a las otras plataformas.
 *
 * Env vars requeridas en el worker:
 *   GOOGLE_CLIENT_ID     — OAuth 2.0 Client ID
 *   GOOGLE_CLIENT_SECRET — OAuth 2.0 Client Secret
 */

import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';
import { logActivity, libreAlbedrioClient } from '../lib/libre-albedrio.js';
import {
  publishYouTubeShort,
  refreshYtAccessToken,
  YouTubeApiError,
} from '../lib/youtube-api.js';

interface YtTokenRow {
  access_token:     string;
  refresh_token:    string;
  yt_channel_id:    string;
  yt_channel_title: string;
  expires_at:       string | null;
}

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from worker env`);
  return v;
}

/** Margen de 5 min antes de la expiración para renovar el token proactivamente. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const publishToYouTube = inngest.createFunction(
  {
    id:          'publish-to-youtube',
    retries:     2,
    concurrency: { limit: 1 },
  },
  { event: 'vidriera/youtube.publish.requested' },
  async ({ event, step, logger }) => {
    const { demoId, demoSlug, storagePath, caption, title, ytAccountId, reelPermalink } =
      event.data;

    // ── 1. ensure-fresh-token ─────────────────────────────────────────
    // Carga el token de DB. Si ya expiró (o expira en <5 min), lo renueva
    // con el refresh_token y persiste el nuevo en la DB.
    const freshAccessToken = await step.run('ensure-fresh-token', async () => {
      const vh = getAdminClient();
      const { data: rows, error } = await vh.rpc('yt_account_get_token', {
        p_account_id: ytAccountId,
      });
      if (error || !rows || (rows as YtTokenRow[]).length === 0) {
        throw new Error(`yt_token_rpc_failed: ${error?.message ?? 'no token row'}`);
      }
      const row = (rows as YtTokenRow[])[0]!;

      // Chequear expiración
      const expiry = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      const needsRefresh = expiry < Date.now() + REFRESH_MARGIN_MS;
      if (!needsRefresh) return row.access_token;

      // Renovar
      const clientId     = reqEnv('GOOGLE_CLIENT_ID');
      const clientSecret = reqEnv('GOOGLE_CLIENT_SECRET');
      const fresh = await refreshYtAccessToken({
        refreshToken: row.refresh_token,
        clientId,
        clientSecret,
      });

      // Persistir el nuevo token (best-effort — no bloquea el upload si falla)
      try {
        await vh.rpc('yt_account_update_token', {
          p_account_id:       ytAccountId,
          p_new_access_token: fresh.accessToken,
          p_new_expires_at:   fresh.expiresAt.toISOString(),
        });
      } catch (err: unknown) {
        logger.warn('youtube.token_update_failed', { error: String(err) });
      }

      logger.info('youtube.token_refreshed', { account: ytAccountId });
      return fresh.accessToken;
    });

    // ── 2. publish-video ──────────────────────────────────────────────
    // Todo en un único step: descarga + upload. Así el Buffer no cruza
    // la barrera de serialización JSON de Inngest.
    type PublishOk     = { ok: true;  videoId: string; permalink: string };
    type PublishFailed = { ok: false; error: string;   authErr: boolean  };
    type PublishResult = PublishOk | PublishFailed;

    const publishResult = await step.run('publish-video', async (): Promise<PublishResult> => {
      // 2a. Descargar el video de Supabase
      const vh = getAdminClient();
      const { data: blob, error: dlErr } = await vh.storage
        .from('videos')
        .download(storagePath);
      if (dlErr || !blob) {
        throw new Error(`video_download_failed: ${dlErr?.message ?? 'no data'}`);
      }
      const videoBuffer = Buffer.from(await blob.arrayBuffer());

      // 2b. Subir a YouTube como Short
      try {
        const result = await publishYouTubeShort({
          accessToken:  freshAccessToken,
          videoBuffer,
          title,
          description:  caption,
        });
        return { ok: true, videoId: result.videoId, permalink: result.permalink };
      } catch (err) {
        if (err instanceof YouTubeApiError && (err.info.terminal || err.info.authError)) {
          logger.error('youtube.terminal_error', {
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
        title:    `Vidriera YouTube: error publicando ${demoSlug}`,
        detail:   `Error: ${publishResult.error}${publishResult.authErr ? ' — reconectar la cuenta de YouTube.' : ''}`,
      }).catch(() => {});
      return { published: false, demoId, error: publishResult.error };
    }

    // ── 3. log-activity ───────────────────────────────────────────────
    await step.run('log-activity', async () => {
      const la = libreAlbedrioClient();
      await logActivity(la, {
        category: 'marketing',
        title:    `Vidriera YouTube: Short publicado — ${title ?? demoSlug}`,
        detail:
          `Short ${publishResult.videoId} publicado en YouTube.` +
          ` Permalink: ${publishResult.permalink}` +
          (reelPermalink ? ` | IG Reel: ${reelPermalink}` : ''),
      });
    });

    // ── 4. cleanup-storage ────────────────────────────────────────────
    await step.run('cleanup-storage', async () => {
      const vh = getAdminClient();
      await vh.storage.from('videos').remove([storagePath]).catch(() => {});
    });

    logger.info('youtube.published', { demo: demoSlug, videoId: publishResult.videoId });
    return {
      published: true,
      demoId,
      demoSlug,
      videoId:   publishResult.videoId,
      permalink: publishResult.permalink,
    };
  },
);
