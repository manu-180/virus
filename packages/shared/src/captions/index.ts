export { transcribeWithAssemblyAI } from './assemblyai.js';
export { transcribeWithWhisper } from './whisper-fallback.js';
export { groupWordsIntoLines, mapSegmentsToWords } from './segment-mapper.js';
export type { Word, CaptionLine, Captions } from './types.js';

import { transcribeWithAssemblyAI } from './assemblyai.js';
import { transcribeWithWhisper } from './whisper-fallback.js';
import { mapSegmentsToWords } from './segment-mapper.js';
import type { Captions, Word } from './types.js';

export async function generateCaptions(input: {
  audioPath: string;
  language: 'es' | 'en';
  segments: Array<{ voiceover: string; index: number }>;
  provider?: 'assemblyai' | 'whisper';
}): Promise<{
  captions: Captions;
  perSegment: Array<{
    segmentIndex: number;
    startSec: number;
    endSec: number;
    words: Word[];
  }>;
}> {
  const { audioPath, language, segments, provider } = input;

  let captions: Captions;

  if (provider === 'whisper') {
    captions = await transcribeWithWhisper({ audioPath, language });
  } else {
    try {
      captions = await transcribeWithAssemblyAI({ audioUrl: audioPath, language });
    } catch (assemblyErr) {
      if (provider === 'assemblyai') throw assemblyErr;
      console.warn('[captions] AssemblyAI failed, falling back to Whisper:', assemblyErr);
      try {
        captions = await transcribeWithWhisper({ audioPath, language });
      } catch (whisperErr) {
        throw new AggregateError(
          [assemblyErr, whisperErr],
          '[captions] Both AssemblyAI and Whisper failed',
        );
      }
    }
  }

  const perSegment = mapSegmentsToWords(captions.words, segments);

  return { captions, perSegment };
}
