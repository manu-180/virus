/// <reference types="node" />
/**
 * S6 SPIKE (publish step) — publish the FINISHED nebula reel to @apex.stack via
 * the new publishReel(). This closes the end-to-end loop: the input here
 * (nebula-final.mp4) is the product of the new pipeline run by new code —
 * record (S2) → edit/editor_machine (S3) → outro compose (S5) — so publishing it
 * proves the whole chain works together (vidriera-video §9 S6).
 *
 * Mirrors the S1 publish driver: upload to the vhirus `videos` bucket → 2h
 * signed URL (Meta fetches over HTTPS) → Page token via RPC
 * ig_account_get_graph_token → publishReel → permalink → cleanup.
 *
 * Run (absolute --env-file — pnpm exec leaves CWD at the repo root):
 *   pnpm --filter @virus/worker exec tsx \
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\spike-publish-nebula.ts"
 *
 * Flags: [--video <abs path>] [--dry-run]  (--dry-run does everything but the publish)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdminClient } from '../src/lib/supabase.js';
import { publishReel, publishVideoStory } from '../src/lib/instagram-graph.js';

// @apex.stack — verified active, auth_type=graph_api (ig_accounts row).
const IG_ACCOUNT_ID = '52c60dd6-23e9-4131-aa3f-47adef5c44b3';
const BUCKET = 'videos';

// APEX caption — CLIENT-STYLE (registered standing rule, vidriera-video §3.2):
// never call it a demo; frame the work subtly as a real product/engagement APEX
// delivered. Warm, argentine, plain, soft CTA (CLAUDE.md copy rules).
const CAPTION = `Cuando los números dejan de marear y empiezan a guiar.

Nebula es la plataforma de analytics con IA que diseñamos y desarrollamos para que un equipo entienda su negocio de un vistazo: dashboards que se arman solos y responden en lenguaje natural. Sin planillas, sin depender de nadie.

Producto, diseño y código, de punta a punta. Así trabajamos en APEX.

¿Tenés una idea dando vueltas? Escribinos y la hacemos realidad.

✨ APEX · diseño + software a medida.

#apex #analytics #ia #producto #diseñoweb #uiux #saas #startups #datos #argentina`;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const workerDir = dirname(here);
  const videoPath = flag('video') ?? join(workerDir, 'tmp-recordings', 'nebula-final.mp4');
  const dryRun = process.argv.includes('--dry-run');

  const supabase = getAdminClient();

  // 1. upload final reel
  const bytes = await readFile(videoPath);
  const objectPath = `spike/nebula-reel-${Date.now()}.mp4`;
  console.log(`[1/4] uploading ${(bytes.length / 1024 / 1024).toFixed(1)}MB → ${BUCKET}/${objectPath}`);
  const up = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  // 2. sign for Meta (2h covers transcode)
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, 2 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`sign failed: ${signed.error?.message ?? 'no url'}`);
  }
  console.log('[2/4] signed URL ready');

  // 3. token via Vault-backed RPC (never logged)
  const { data: rows, error: rpcErr } = await supabase.rpc('ig_account_get_graph_token', {
    p_account_id: IG_ACCOUNT_ID,
  });
  if (rpcErr || !rows || rows.length === 0) {
    throw new Error(`token RPC failed: ${rpcErr?.message ?? 'no token row'}`);
  }
  const tokenRow = rows[0] as { access_token: string; graph_user_id: string; ig_username: string };
  console.log(`[3/4] token for ig_user=${tokenRow.graph_user_id} (@${tokenRow.ig_username})`);

  if (dryRun) {
    console.log('[4] --dry-run: skipping publish. Removing the spike object.');
    await supabase.storage.from(BUCKET).remove([objectPath]);
    console.log('DRY-RUN OK ✓ (upload + sign + token all worked; nothing published)');
    return;
  }

  // What to publish: Reel + Story by default — the SAME finished video lands as
  // a Reel AND as a Story (so Manuel can save it to a Highlight). The flags
  // --reel-only / --story-only restrict it (used to corroborate one path).
  const reelOnly = process.argv.includes('--reel-only');
  const storyOnly = process.argv.includes('--story-only');
  const videoUrl = signed.data.signedUrl;
  const igUserId = tokenRow.graph_user_id;
  const accessToken = tokenRow.access_token;
  const published: Record<string, unknown> = {};

  if (!storyOnly) {
    console.log('[4] publishing Reel… (polling container until FINISHED)');
    published.reel = await publishReel({ igUserId, accessToken, videoUrl, caption: CAPTION });
    console.log('REEL ✓', JSON.stringify(published.reel));
  }
  if (!reelOnly) {
    console.log('[5] publishing the SAME video as a Story… (Meta transcodes; polling)');
    published.story = await publishVideoStory({ igUserId, accessToken, videoUrl });
    console.log('STORY ✓', JSON.stringify(published.story));
  }
  console.log('PUBLISHED ✓', JSON.stringify(published, null, 2));

  // cleanup spike object (Meta already keeps its own copy of each)
  const del = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (del.error) console.warn(`(cleanup) could not remove ${objectPath}: ${del.error.message}`);
  else console.log(`(cleanup) removed ${BUCKET}/${objectPath}`);
}

main().catch((e) => {
  console.error('S6 PUBLISH FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
