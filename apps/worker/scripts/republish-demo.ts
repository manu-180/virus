/// <reference types="node" />
/**
 * Republish ONE demo's Reel + Story LOCALLY, with the fixed recorder (2026-06-17).
 *
 * Faithful copy of the orchestrator's produce-publish chain
 * (apps/worker/src/functions/vidriera-orchestrator.ts), driven locally + targeted
 * by SLUG, so it uses the local (fixed) recorder.ts without waiting on the Railway
 * redeploy. Re-uploads nebula + brasa with the white-frame + scroll fixes after
 * Manuel deleted the old posts.
 *
 * It does NOT touch the libre_albedrio `demos` table (those service-role creds live
 * only on Railway). The demo fields are embedded below; marking promoted + the
 * activity_log row are done afterwards via the Supabase MCP. It only needs the
 * envs the assistify driver already uses locally (editor_machine, IG token via the
 * vhirus admin client, ELEVENLABS_*).
 *
 * Run (absolute --env-file — pnpm exec leaves CWD at the repo root):
 *   pnpm --filter @virus/worker exec tsx \
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\republish-demo.ts" <slug> [--dry-run]
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAdminClient } from '../src/lib/supabase.js';
import { generateVoScript, generateCaption } from '../src/lib/vidriera-copy.js';
import { evaluateFailSafes } from '../src/lib/vidriera-checks.js';
import { recordDemoScroll, probeDurationSec, probeHasAudioStream } from '../src/lib/recorder.js';
import { submitEditorJobExactSubs } from '../src/lib/editor-machine.js';
import { composeWithOutro } from '../src/lib/compose.js';
import { publishReel, publishVideoStory } from '../src/lib/instagram-graph.js';
import { generateAudioFromScript, VOICE_PRESETS } from '@virus/shared/audio';

const IG_ACCOUNT_ID = '52c60dd6-23e9-4131-aa3f-47adef5c44b3';
const VIDEOS_BUCKET = 'videos';
const TAIL_SEC = 1.8;
const VO_SPEED_MULTIPLIER = 1.0;
const CALM_PX_PER_SEC = 195;

// Demo fields (from the libre_albedrio `demos` table) — embedded so the driver
// needs no cross-project service key. generateVoScript/Caption read these.
interface Demo {
  slug: string;
  titulo: string;
  pitch: string;
  tipo_producto: string;
  url_deploy: string;
}
const DEMOS: Record<string, Demo> = {
  brasa: {
    slug: 'brasa',
    titulo: 'Brasa',
    pitch:
      'Restaurante de fine dining de cocina de fuego de autor: parrilla y brasas elevadas a alta cocina. Editorial, lujo serif, dark cálido. One-pager cinematográfico con parallax y scroll-telling.',
    tipo_producto: 'restaurante/gastronomia',
    url_deploy: 'https://demo-brasa.vercel.app',
  },
  nebula: {
    slug: 'nebula',
    titulo: 'Nebula',
    pitch: 'Landing de un SaaS de analytics con IA — estética del futuro',
    tipo_producto: 'landing-saas',
    url_deploy: 'https://nebula-delta-henna.vercel.app',
  },
};

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing from worker env`);
  return v;
}

function outroPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/worker/scripts
  return join(here, '..', 'assets', 'apex-outro.mp4');
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug || slug.startsWith('--')) throw new Error('usage: republish-demo.ts <slug> [--dry-run]');
  const demo = DEMOS[slug];
  if (!demo) throw new Error(`no embedded demo for slug=${slug} (have: ${Object.keys(DEMOS).join(', ')})`);
  const dryRun = process.argv.includes('--dry-run');

  const vh = getAdminClient();
  const voiceId = reqEnv('ELEVENLABS_VOICE_ID_AR');
  const url = demo.url_deploy;
  const safeSlug = demo.slug.replace(/[^a-z0-9-]/gi, '_');
  const workDir = await mkdtemp(join(tmpdir(), `republish-${safeSlug}-`));
  console.log(`[republish] ${slug} → ${url}`);

  try {
    console.log('[1/6] copy (VO + caption)…');
    const script = await generateVoScript(demo);
    const caption = await generateCaption(demo);

    console.log('[2/6] voice-over (TTS)…');
    const audio = await generateAudioFromScript({
      segments: [{ voiceover: script }],
      preset: VOICE_PRESETS['educational']!,
      outputDir: join(workDir, 'vo'),
      voiceId,
      speedMultiplier: VO_SPEED_MULTIPLIER,
    });

    console.log(`[3/6] record scroll @ ${CALM_PX_PER_SEC}px/s (fixed recorder)…`);
    const scrollPath = join(workDir, 'scroll.mp4');
    await recordDemoScroll({
      url,
      outPath: scrollPath,
      durationSec: audio.durationSec + TAIL_SEC,
      maxSpeedPxPerSec: CALM_PX_PER_SEC,
    });

    console.log('[4/6] editor_machine (trim + karaoke subs)…');
    const renderPath = join(workDir, 'render.mp4');
    await submitEditorJobExactSubs({
      videoPath: scrollPath,
      audioPath: audio.processedMp3,
      outPath: renderPath,
      subtitleScript: script,
    });

    console.log('[5/6] outro + crossfade…');
    const finalPath = join(workDir, 'final.mp4');
    await composeWithOutro({ inPath: renderPath, outroPath: outroPath(), outPath: finalPath });

    console.log('[6/6] fail-safes…');
    const status = await fetch(url, { method: 'GET', redirect: 'follow' }).then((r) => r.status).catch(() => 0);
    const [renderSec, finalHasAudio] = await Promise.all([
      probeDurationSec(renderPath),
      probeHasAudioStream(finalPath),
    ]);
    const checks = evaluateFailSafes({
      demoUrlStatus: status,
      renderSec,
      audioSec: audio.durationSec,
      renderHasAudioTrack: finalHasAudio,
      scriptText: script,
      caption,
    });
    if (!checks.ok) throw new Error(`fail-safes tripped: ${checks.failures.join('; ')}`);

    console.log(`\n── GUION ──\n${script}\n\n── CAPTION ──\n${caption}\n`);

    if (dryRun) {
      console.log(`DRY-RUN OK ✓ (render ${renderSec.toFixed(1)}s ≈ VO ${audio.durationSec.toFixed(1)}s; nothing published)`);
      console.log(`VIDEO: ${finalPath}`);
      return;
    }

    const finalBytes = await readFile(finalPath);
    const objectPath = `vidriera/${safeSlug}-${Date.now()}.mp4`;
    const up = await vh.storage.from(VIDEOS_BUCKET).upload(objectPath, finalBytes, {
      contentType: 'video/mp4',
      upsert: true,
    });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const signed = await vh.storage.from(VIDEOS_BUCKET).createSignedUrl(objectPath, 2 * 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new Error(`sign failed: ${signed.error?.message ?? 'no url'}`);
    const videoUrl = signed.data.signedUrl;

    const { data: rows, error: rpcErr } = await vh.rpc('ig_account_get_graph_token', { p_account_id: IG_ACCOUNT_ID });
    if (rpcErr || !rows || (rows as unknown[]).length === 0) throw new Error(`token RPC failed: ${rpcErr?.message ?? 'no row'}`);
    const tokenRow = (rows as Array<{ access_token: string; graph_user_id: string }>)[0]!;

    console.log('publishing Reel…');
    const reel = await publishReel({
      igUserId: tokenRow.graph_user_id,
      accessToken: tokenRow.access_token,
      videoUrl,
      caption,
    });
    console.log('REEL ✓', reel.permalink);

    const story = await publishVideoStory({
      igUserId: tokenRow.graph_user_id,
      accessToken: tokenRow.access_token,
      videoUrl,
    }).catch((err) => {
      console.warn('story failed (non-fatal):', err instanceof Error ? err.message : err);
      return null;
    });
    if (story) console.log('STORY ✓', story.permalink);

    await vh.storage.from(VIDEOS_BUCKET).remove([objectPath]).catch(() => {});
    console.log(`\nPUBLISHED ✓  slug=${slug}  reel=${reel.permalink ?? reel.mediaId}  story=${story?.permalink ?? 'none'}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error('REPUBLISH FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
