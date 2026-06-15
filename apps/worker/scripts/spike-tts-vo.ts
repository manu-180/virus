/// <reference types="node" />
/**
 * S4 SPIKE — synthesize ONE female voice-over with the vhirus ElevenLabs key.
 *
 * Throwaway/manual driver: proves headless TTS with a FEMALE voice (the format
 * mandates a Rioplatense female VO) using vhirus' own ELEVENLABS_API_KEY, then
 * reports the clip duration so S3 can duration-anchor the demo scroll to it.
 * It is NOT wired into Inngest — the durable pipeline is Horno-phase work (see
 * libre_albedrio/tools/vidriera-video.md §9). This script just proves the lib.
 *
 * Voice: the worker env default ELEVENLABS_VOICE_ID (ByVRQtaK1WDOvTmP1PKO) is
 * MASCULINE per the spec (§3.3) and must NOT be used here. Manuel's argentine
 * female Voice ID is still pending (INBOX); until then the sanctioned temporary
 * default is a standard ElevenLabs multilingual female premade voice. We pass it
 * explicitly so we never fall back to the masculine env default. Override with
 * `--voice <id>` once Manuel provides the AR female id.
 *
 * Reuses the production path generateAudioFromScript() (same as
 * synthesize-audio.ts): ElevenLabs TTS → post-process (1.15× speed, loudnorm
 * -15 LUFS, highpass) → processed.mp3. The 1.15× also reads a touch snappier,
 * which matches Manuel's "un poco más rápido" note.
 *
 * Run (absolute --env-file is required — pnpm exec leaves CWD at the repo root):
 *   pnpm --filter @virus/worker exec tsx \
 *     --env-file="C:\MisProyectos\Armagedon\vhirus\apps\worker\.env.local" \
 *     "C:\MisProyectos\Armagedon\vhirus\apps\worker\scripts\spike-tts-vo.ts"
 *
 * Flags: [--voice <elevenlabs-id>] [--text "<vo text>"] [--out <abs path>]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
import { generateAudioFromScript, VOICE_PRESETS } from '@virus/shared/audio';

// Manuel's argentine FEMALE Voice ID (provided 2026-06-15). This is the real
// production voice for the @apex.stack reels. Deliberately NOT the masculine
// env default ByVRQtaK1WDOvTmP1PKO. Override with --voice for experiments.
const DEFAULT_FEMALE_VOICE = 'K7gx0ylJdff0yjM2uVQS';

// Representative nebula VO (the SPIKE input — the final reel's script will be
// generated from the demos row in S6). Voseo, warm @apex.stack tone. Sized so
// the fast AR female voice lands ~24s → a brisk-but-readable scroll (~210 px/s,
// Manuel's "un poco más rápido"): hook → problem → solution → APEX CTA. Echoes
// nebula's headline ("por fin con sentido"). nebula = "Analytics con IA".
const DEFAULT_VO = [
  '¿Cuántas decisiones tomás a ciegas porque tus datos viven desparramados en mil planillas distintas?',
  'Nebula los junta todos en un solo lugar y, con inteligencia artificial, te muestra qué está pasando en tu negocio en segundos.',
  'Sin fórmulas raras, sin depender de un analista, sin perder la mañana armando reportes.',
  'Tus números, por fin con sentido.',
  'Lo diseñamos y programamos en APEX, a medida. Si tenés una idea que merece una herramienta así, hablemos.',
].join(' ');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/worker/scripts
  const workerDir = dirname(here); // apps/worker
  const outDir = join(workerDir, 'tmp-recordings', 'vo-nebula');
  const finalOut = flag('out') ?? join(workerDir, 'tmp-recordings', 'nebula-vo.mp3');

  const voiceId = flag('voice') ?? DEFAULT_FEMALE_VOICE;
  const text = flag('text') ?? DEFAULT_VO;

  console.log(`[tts] voice=${voiceId} chars=${text.length}`);
  console.log(`[tts] out=${finalOut}`);

  const result = await generateAudioFromScript({
    segments: [{ index: 0, voiceover: text }],
    preset: VOICE_PRESETS['educational']!,
    outputDir: outDir,
    voiceId,
  });

  // Keep a clean, named artifact next to the S2 video for the S3 submit.
  await copyFile(result.processedMp3, finalOut);

  console.log('TTS OK ✓');
  console.log(
    JSON.stringify(
      { voiceId, durationSec: result.durationSec, processedMp3: finalOut, rawMp3: result.rawMp3 },
      null,
      2,
    ),
  );
  console.log(`\n[tts] duration ≈ ${result.durationSec.toFixed(2)}s → S3 records nebula at durationSec = ${(result.durationSec + 1.8).toFixed(2)} (VO + ~1.8s tail)`);
}

main().catch((e) => {
  console.error('TTS SPIKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
