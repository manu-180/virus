/// <reference types="node" />
/**
 * TAREA 2 — assistify.lat MULTI-RUTA → Reel + Story a @apex.stack.
 *
 * First real multi-route tour (vidriera-video §7): records a scroll TOUR across
 * several assistify.lat routes (reusing the new recordSiteTour), narrates it with
 * the AR voice, burns karaoke subs via editor_machine, adds the APEX outro, runs
 * the same fail-safes as the Horno — then STOPS for Manuel to approve the video +
 * caption before anything is published. assistify is NOT a `demos` row, so the
 * copy is driven by an inline demoOverride (the rest of the pipeline is identical).
 *
 * Two phases (so Manuel approves EXACTLY what gets posted):
 *   1. produce (default): build everything → write final.mp4 + caption.txt for review.
 *   2. publish (--publish): read the SAVED final.mp4 + caption.txt → Reel + Story.
 *
 * Run (absolute --env-file — pnpm exec leaves CWD at the repo root; fast presets
 * for the loaded machine, see vidriera-video §9 GOTCHA):
 *   $env:RECORDER_X264_PRESET="ultrafast"; $env:TOUR_X264_PRESET="veryfast"; $env:COMPOSE_X264_PRESET="veryfast"
 *   pnpm --filter @virus/worker exec tsx `
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" `
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\spike-assistify-tour.ts"
 *   # …review tmp-recordings\assistify-tour-final.mp4 + caption, then:
 *   pnpm … spike-assistify-tour.ts --publish
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DemoRow } from '../src/lib/vidriera-selection.js';
import { generateVoScript, generateCaption } from '../src/lib/vidriera-copy.js';
import { recordSiteTour, findPricingRoute } from '../src/lib/site-tour.js';
import { submitEditorJob } from '../src/lib/editor-machine.js';
import { composeWithOutro } from '../src/lib/compose.js';
import { probeDurationSec, probeHasAudioStream } from '../src/lib/recorder.js';
import { evaluateFailSafes } from '../src/lib/vidriera-checks.js';
import { publishReel, publishVideoStory } from '../src/lib/instagram-graph.js';
import { getAdminClient } from '../src/lib/supabase.js';
import { generateAudioFromScript, VOICE_PRESETS } from '@virus/shared/audio';

// @apex.stack — APEX portfolio IG account (ig_accounts row, graph_api).
const IG_ACCOUNT_ID = '52c60dd6-23e9-4131-aa3f-47adef5c44b3';
const VIDEOS_BUCKET = 'videos';
const BASE_URL = 'https://assistify.lat';
const TAIL_SEC = 1.8;

// Focused tour: home + the pricing route (auto-detected generically). Two calm
// routes beat five racing ones — Manuel's call (2026-06-15).
const FALLBACK_PRICING_ROUTE = '/planes';
// Calm scroll: cap the pan speed so tall pages show their TOP at ~195 px/s
// (the registered "un toque ágil" feel, spec §0.7) instead of racing. Tunable.
const CALM_PX_PER_SEC = Number(process.env['TOUR_MAX_PX_PER_SEC'] ?? 195);
// VO tempo: 1.0 = no post speed-up (calmer/paused, per Manuel). Shared default 1.15×.
const VO_SPEED = Number(process.env['VO_SPEED'] ?? 1.0);

// assistify is a REAL product APEX designed + built — frame it honestly as such
// (client-style, never the word "demo"). Rich pitch → authentic Claude VO/caption.
const ASSISTIFY: DemoRow = {
  id: 'assistify-lat',
  slug: 'assistify',
  titulo: 'Assistify — la app que gestiona tu academia sola',
  tipo_producto: 'plataforma web + mobile para academias, talleres y estudios',
  pitch:
    'Assistify automatiza la gestión de clases de academias y talleres: los alumnos ' +
    'reservan, cancelan y recuperan sus clases solos desde la app; cuando se libera un ' +
    'lugar, la lista de espera lo completa sola y avisa por notificación; sistema de ' +
    'créditos, inscripciones 24/7 y avisos automáticos. Se termina coordinar todo por ' +
    'WhatsApp. Pensada para docentes y dueños de institutos —yoga, danza, cerámica, ' +
    'música, pilates y más—. Diseñada y desarrollada por APEX de punta a punta. ' +
    'Arranca con 15 días gratis, sin tarjeta.',
  caption_ig:
    'Tu academia se gestiona sola: cancelaciones, recuperos y lista de espera, ' +
    'automáticos. Tus alumnos lo resuelven desde la app y vos recuperás tu tiempo.',
  status: 'deployado',
  url_deploy: BASE_URL,
  created_at: '2026-06-15T00:00:00Z',
  promoted_at: null,
  ig_permalink: null,
  promo_error: null,
};

function outDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/worker/scripts
  return join(dirname(here), 'tmp-recordings');
}
const FINAL_PATH = join(outDir(), 'assistify-tour-final.mp4');
const CAPTION_PATH = join(outDir(), 'assistify-tour-caption.txt');
const SCRIPT_PATH = join(outDir(), 'assistify-tour-script.txt');

function resolveOutroPath(): string {
  const override = process.env['APEX_OUTRO_PATH'];
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(dirname(here), 'assets', 'apex-outro.mp4');
}

async function fetchUrlStatus(url: string): Promise<number> {
  try {
    return (await fetch(url, { method: 'GET', redirect: 'follow' })).status;
  } catch {
    return 0;
  }
}

// ── PRODUCE: build the final reel + caption, run fail-safes, save for review ──
async function produce(): Promise<void> {
  await mkdir(outDir(), { recursive: true });
  const voiceId = process.env['ELEVENLABS_VOICE_ID_AR'];
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID_AR missing from env');

  console.log('[1/6] copy — VO script + caption (Claude, client-style)…');
  const script = await generateVoScript(ASSISTIFY);
  const caption = await generateCaption(ASSISTIFY);
  console.log(`      script: ${script.length} chars · caption: ${caption.length} chars`);

  console.log('[2/6] voice-over — TTS (AR voice)…');
  const audio = await generateAudioFromScript({
    segments: [{ voiceover: script }],
    preset: VOICE_PRESETS['educational']!,
    outputDir: join(outDir(), 'assistify-vo'),
    voiceId,
    speedMultiplier: VO_SPEED,
  });
  console.log(`      VO ${audio.durationSec.toFixed(1)}s → tour target ${(audio.durationSec + TAIL_SEC).toFixed(1)}s`);

  const pricingRoute = (await findPricingRoute(BASE_URL)) ?? FALLBACK_PRICING_ROUTE;
  const routes = ['/', pricingRoute];
  console.log(`[3/6] record TOUR — ${routes.join(' , ')} (pricing auto-detected: ${pricingRoute}) @ ${CALM_PX_PER_SEC}px/s…`);
  const tourPath = join(outDir(), 'assistify-tour.mp4');
  const tour = await recordSiteTour({
    baseUrl: BASE_URL,
    routes,
    outPath: tourPath,
    totalDurationSec: audio.durationSec + TAIL_SEC,
    transitionSec: 0.5,
    depad: true,
    maxSpeedPxPerSec: CALM_PX_PER_SEC,
  });
  console.log(`      tour ${tour.durationSec.toFixed(1)}s · ${tour.routes.length} clips → ${tour.width}x${tour.height}`);

  console.log('[4/6] editor_machine — trim to VO + burn karaoke-cyan subs…');
  const renderPath = join(outDir(), 'assistify-render.mp4');
  await submitEditorJob({ videoPath: tourPath, audioPath: audio.processedMp3, outPath: renderPath });

  console.log('[5/6] outro — APEX neon + crossfade…');
  await composeWithOutro({ inPath: renderPath, outroPath: resolveOutroPath(), outPath: FINAL_PATH });

  console.log('[6/6] fail-safes…');
  const [urlStatus, renderSec, finalHasAudio] = await Promise.all([
    fetchUrlStatus(BASE_URL),
    probeDurationSec(renderPath),
    probeHasAudioStream(FINAL_PATH),
  ]);
  const checks = evaluateFailSafes({
    demoUrlStatus: urlStatus,
    renderSec,
    audioSec: audio.durationSec,
    renderHasAudioTrack: finalHasAudio,
    scriptText: script,
    caption,
  });

  await writeFile(CAPTION_PATH, caption, 'utf8');
  await writeFile(SCRIPT_PATH, script, 'utf8');
  const finalSec = await probeDurationSec(FINAL_PATH);

  console.log('\n────────────────── REVISIÓN (Manuel) ──────────────────');
  console.log(`VIDEO  : ${FINAL_PATH}  (${finalSec.toFixed(1)}s, 1080x1920)`);
  console.log(`FAIL-SAFES: ${checks.ok ? 'OK ✓' : 'BLOCKED ✗ — ' + checks.failures.join('; ')}`);
  console.log('\n── GUION (voz en off) ──\n' + script);
  console.log('\n── CAPTION ──\n' + caption);
  console.log('\n────────────────────────────────────────────────────────');
  console.log('Si lo aprobás: corré el mismo script con  --publish');
  if (!checks.ok) {
    console.log('⚠️  Las fail-safes fallaron; revisar antes de publicar.');
    process.exitCode = 2;
  }
}

// ── PUBLISH: post the SAVED, approved final.mp4 + caption as Reel + Story ─────
async function publish(): Promise<void> {
  const reelOnly = process.argv.includes('--reel-only');
  const storyOnly = process.argv.includes('--story-only');
  const [bytes, caption] = await Promise.all([
    readFile(FINAL_PATH),
    readFile(CAPTION_PATH, 'utf8'),
  ]);
  if (!caption.trim()) throw new Error('caption file is empty — run produce first');
  console.log(`Publishing ${(bytes.length / 1024 / 1024).toFixed(1)}MB · caption ${caption.length} chars`);

  const supabase = getAdminClient();
  const objectPath = `vidriera/assistify-tour-${Date.now()}.mp4`;
  const up = await supabase.storage
    .from(VIDEOS_BUCKET)
    .upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);
  const signed = await supabase.storage.from(VIDEOS_BUCKET).createSignedUrl(objectPath, 2 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`sign failed: ${signed.error?.message ?? 'no url'}`);
  }
  const videoUrl = signed.data.signedUrl;

  const { data: rows, error: rpcErr } = await supabase.rpc('ig_account_get_graph_token', {
    p_account_id: IG_ACCOUNT_ID,
  });
  if (rpcErr || !rows || rows.length === 0) {
    throw new Error(`token RPC failed: ${rpcErr?.message ?? 'no token row'}`);
  }
  const tokenRow = rows[0] as { access_token: string; graph_user_id: string; ig_username: string };
  const igUserId = tokenRow.graph_user_id;
  const accessToken = tokenRow.access_token;
  console.log(`token for @${tokenRow.ig_username} (ig_user=${igUserId})`);

  if (!storyOnly) {
    const reel = await publishReel({ igUserId, accessToken, videoUrl, caption });
    console.log('REEL ✓', JSON.stringify(reel));
  }
  if (!reelOnly) {
    const story = await publishVideoStory({ igUserId, accessToken, videoUrl });
    console.log('STORY ✓', JSON.stringify(story));
  }

  await supabase.storage.from(VIDEOS_BUCKET).remove([objectPath]).catch(() => {});
  console.log('PUBLISHED ✓');
}

async function main(): Promise<void> {
  if (process.argv.includes('--publish')) await publish();
  else await produce();
}

main().catch((e) => {
  console.error('ASSISTIFY TOUR FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
