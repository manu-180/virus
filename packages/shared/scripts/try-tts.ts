#!/usr/bin/env tsx
/**
 * CLI smoke test for the TTS audio module.
 * Usage: ELEVENLABS_API_KEY=sk-... tsx packages/shared/scripts/try-tts.ts
 */
import { generateAudioFromScript } from '../src/audio/index.js';
import { VOICE_PRESETS } from '../src/audio/voice-config.js';

async function main() {
  const educational = VOICE_PRESETS['educational'];
  if (educational === undefined) {
    throw new Error('educational preset not found');
  }

  const out = await generateAudioFromScript({
    segments: [
      { voiceover: 'Estás escribiendo useEffect mal. Y no te diste cuenta.' },
      { voiceover: 'Sin cleanup, vas a tener memory leaks en producción.' },
      { voiceover: 'Mirá la versión correcta.' },
    ],
    preset: educational,
    outputDir: '/tmp/virus-test',
  });

  console.log(out);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
