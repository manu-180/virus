import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { synthesize } from './elevenlabs.js';
import { postProcess } from './post-process.js';
import { VOICE_PRESETS, POST_PROCESSING } from './voice-config.js';
import type { GenerateAudioInput, GenerateAudioResult, SegmentTiming } from './types.js';

export * from './elevenlabs.js';
export * from './post-process.js';
export * from './types.js';
export * from './voice-config.js';

export async function generateAudioFromScript(
  input: GenerateAudioInput,
): Promise<GenerateAudioResult> {
  await mkdir(input.outputDir, { recursive: true });

  const concatenated = input.segments.map((s) => s.voiceover).join(' ... ');

  let presetKey = 'educational';
  for (const [key, value] of Object.entries(VOICE_PRESETS)) {
    if (value === input.preset) {
      presetKey = key;
      break;
    }
  }

  const rawMp3 = path.join(input.outputDir, 'raw.mp3');
  await synthesize({
    text: concatenated,
    preset: presetKey,
    outputPath: rawMp3,
    ...(input.voiceId !== undefined && { voiceId: input.voiceId }),
  });

  const processedMp3 = path.join(input.outputDir, 'processed.mp3');
  const postProcessResult = await postProcess({
    inputPath: rawMp3,
    outputPath: processedMp3,
    speedMultiplier: POST_PROCESSING.speedMultiplier,
    targetLufs: POST_PROCESSING.targetLufs,
    highpassHz: POST_PROCESSING.highpassHz,
  });

  const totalDurationSec = postProcessResult.durationSec;

  const totalChars = input.segments.reduce((sum, s) => sum + s.voiceover.length, 0);

  let perSegmentTimings: SegmentTiming[] = [];
  if (totalChars > 0) {
    let cursor = 0;
    perSegmentTimings = input.segments.map((s, index) => {
      const segDuration = (s.voiceover.length / totalChars) * totalDurationSec;
      const startSec = cursor;
      const endSec = cursor + segDuration;
      cursor = endSec;
      return { index, startSec, endSec };
    });
  }

  return {
    rawMp3,
    processedMp3,
    durationSec: totalDurationSec,
    perSegmentTimings,
  };
}
