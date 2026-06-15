/**
 * S1 SPIKE — publish ONE real Reel to @apex.stack via the new publishReel().
 *
 * Throwaway/manual driver: validates the Graph API REELS path end-to-end with a
 * finished vertical video. It is NOT wired into Inngest — the durable
 * `publish-reel-to-instagram` function is Horno-phase work (see
 * libre_albedrio/tools/vidriera-video.md §9). This script just proves the lib.
 *
 * What it does:
 *   1. uploads the local video to the vhirus `videos` bucket (spike/ prefix)
 *   2. creates a 2h signed HTTPS URL (Meta fetches the video from it)
 *   3. fetches the @apex.stack Page token via RPC ig_account_get_graph_token
 *      (server-side — the token is never logged)
 *   4. calls publishReel() → media_type=REELS → poll FINISHED → media_publish
 *   5. prints mediaId + permalink, then removes the spike object from Storage
 *
 * Run (from apps/worker):
 *   tsx --env-file=.env.local scripts/spike-publish-reel.ts "<absolute video path>"
 */
import { readFile } from 'node:fs/promises';
import { getAdminClient } from '../src/lib/supabase.js';
import { publishReel } from '../src/lib/instagram-graph.js';

// @apex.stack — verified active, auth_type=graph_api (ig_accounts row).
const IG_ACCOUNT_ID = '52c60dd6-23e9-4131-aa3f-47adef5c44b3';
const BUCKET = 'videos';

// Caption shown to / approved by Manuel before the run. Warm, institute-owner
// voice (Assistify's audience), APEX portfolio CTA — per CLAUDE.md copy rules.
const CAPTION = `Llevar un instituto no debería significar vivir pegado al WhatsApp.

Assistify junta todo en un solo lugar: reservas de clases, lista de espera, recordatorios automáticos y cobros. Tus alumnos se anotan solos y vos recuperás tiempo para lo que de verdad importa: enseñar.

La diseñamos y programamos en APEX, a medida. Si tenés un proyecto que merece una herramienta así, hablemos.

✨ APEX · diseño + software para que tu negocio funcione solo.

#apex #assistify #institutos #software #automatización #pymesargentinas #apps #emprender`;

async function main(): Promise<void> {
  const videoPath = process.argv[2];
  if (!videoPath) {
    throw new Error('usage: tsx scripts/spike-publish-reel.ts "<absolute video path>"');
  }

  const supabase = getAdminClient();

  // 1. upload local video
  const bytes = await readFile(videoPath);
  const objectPath = `spike/reel-test-${Date.now()}.mp4`;
  console.log(`[1/4] uploading ${(bytes.length / 1024 / 1024).toFixed(1)}MB → ${BUCKET}/${objectPath}`);
  const up = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  // 2. sign it so Meta can fetch over HTTPS (2h is plenty for transcode)
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, 2 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`sign failed: ${signed.error?.message ?? 'no url'}`);
  }
  const videoUrl = signed.data.signedUrl;
  console.log('[2/4] signed URL ready');

  // 3. token via Vault-backed RPC (mirror of doGraphPublish). Never log it.
  const { data: rows, error: rpcErr } = await supabase.rpc('ig_account_get_graph_token', {
    p_account_id: IG_ACCOUNT_ID,
  });
  if (rpcErr || !rows || rows.length === 0) {
    throw new Error(`token RPC failed: ${rpcErr?.message ?? 'no token row'}`);
  }
  const tokenRow = rows[0] as { access_token: string; graph_user_id: string; ig_username: string };
  console.log(`[3/4] token for ig_user=${tokenRow.graph_user_id} (@${tokenRow.ig_username})`);

  // 4. publish (Meta transcodes server-side; can take a couple of minutes)
  console.log('[4/4] publishing Reel… (polling container until FINISHED)');
  const result = await publishReel({
    igUserId: tokenRow.graph_user_id,
    accessToken: tokenRow.access_token,
    videoUrl,
    caption: CAPTION,
  });
  console.log('PUBLISHED ✓', JSON.stringify(result, null, 2));

  // 5. best-effort cleanup of the spike object (Meta already has its own copy)
  const del = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (del.error) console.warn(`(cleanup) could not remove ${objectPath}: ${del.error.message}`);
  else console.log(`(cleanup) removed ${BUCKET}/${objectPath}`);
}

main().catch((e) => {
  console.error('SPIKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
