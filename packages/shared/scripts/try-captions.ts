#!/usr/bin/env tsx
/**
 * CLI smoke test for the captions module.
 *
 * Usage (real transcription — requires ASSEMBLYAI_API_KEY):
 *   ASSEMBLYAI_API_KEY=sk-... tsx packages/shared/scripts/try-captions.ts path/to/audio.mp3
 *
 * Usage (mock example — no key needed):
 *   tsx packages/shared/scripts/try-captions.ts
 */
import { generateCaptions } from '../src/captions/index.js';
import type { CaptionLine } from '../src/captions/index.js';

// ---------------------------------------------------------------------------
// Mock data used when no real audio is provided
// ---------------------------------------------------------------------------

const MOCK_SEGMENTS = [
  { index: 0, voiceover: 'Lo que nadie te dice sobre TypeScript en producción' },
  { index: 1, voiceover: 'La mayoría de los devs comete este error con los tipos' },
  { index: 2, voiceover: 'Usá unknown en lugar de any y tu código va a ser mucho más seguro' },
];

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function printLines(lines: CaptionLine[]): void {
  for (const line of lines) {
    console.log(`  [${formatMs(line.startMs)} --> ${formatMs(line.endMs)}]  ${line.text}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const audioPath = process.argv[2];
  const hasKey = Boolean(process.env['ASSEMBLYAI_API_KEY']);

  if (audioPath && hasKey) {
    console.log(`Transcribing: ${audioPath}`);
    console.log('Provider: assemblyai (with Whisper fallback)\n');

    const { captions, perSegment } = await generateCaptions({
      audioPath,
      language: 'es',
      segments: MOCK_SEGMENTS,
    });

    console.log(`Language:        ${captions.language}`);
    console.log(`Total duration:  ${(captions.totalDurationMs / 1000).toFixed(2)}s`);
    console.log(`Words:           ${captions.words.length}`);
    console.log(`Caption lines:   ${captions.lines.length}\n`);

    console.log('Caption lines:');
    printLines(captions.lines);

    console.log('\nPer-segment alignment:');
    for (const seg of perSegment) {
      const text = seg.words.map((w) => w.text).join(' ');
      console.log(
        `  Segment ${seg.segmentIndex}: ${seg.startSec.toFixed(2)}s - ${seg.endSec.toFixed(2)}s  "${text}"`,
      );
    }
  } else {
    if (audioPath && !hasKey) {
      console.warn('ASSEMBLYAI_API_KEY not set — running mock example instead.\n');
    }

    console.log('Usage: ASSEMBLYAI_API_KEY=<key> tsx packages/shared/scripts/try-captions.ts <audio.mp3>\n');
    console.log('Mock example output:\n');

    // Simulate what real output looks like using static word data
    const mockWords = [
      { text: 'Lo', startMs: 0, endMs: 150, confidence: 0.99 },
      { text: 'que', startMs: 160, endMs: 280, confidence: 0.98 },
      { text: 'nadie', startMs: 290, endMs: 500, confidence: 0.97 },
      { text: 'te', startMs: 510, endMs: 590, confidence: 0.99 },
      { text: 'dice', startMs: 600, endMs: 820, confidence: 0.96 },
      { text: 'sobre', startMs: 900, endMs: 1100, confidence: 0.95 },
      { text: 'TypeScript', startMs: 1110, endMs: 1500, confidence: 0.98 },
      { text: 'en', startMs: 1510, endMs: 1600, confidence: 0.99 },
      { text: 'producción', startMs: 1610, endMs: 2000, confidence: 0.94 },
      { text: 'La', startMs: 2200, endMs: 2300, confidence: 0.99 },
      { text: 'mayoría', startMs: 2310, endMs: 2600, confidence: 0.97 },
      { text: 'comete', startMs: 2700, endMs: 3000, confidence: 0.96 },
      { text: 'este', startMs: 3010, endMs: 3150, confidence: 0.98 },
      { text: 'error.', startMs: 3160, endMs: 3400, confidence: 0.95 },
      { text: 'Usá', startMs: 3600, endMs: 3750, confidence: 0.93 },
      { text: 'unknown', startMs: 3760, endMs: 4000, confidence: 0.97 },
      { text: 'en', startMs: 4010, endMs: 4090, confidence: 0.99 },
      { text: 'lugar', startMs: 4100, endMs: 4300, confidence: 0.96 },
      { text: 'de', startMs: 4310, endMs: 4380, confidence: 0.99 },
      { text: 'any.', startMs: 4390, endMs: 4600, confidence: 0.98 },
    ];

    // Use the real groupWordsIntoLines via the module
    const { groupWordsIntoLines, mapSegmentsToWords } = await import('../src/captions/index.js');

    const lines = groupWordsIntoLines(mockWords);
    const perSegment = mapSegmentsToWords(mockWords, MOCK_SEGMENTS);

    console.log('Caption lines:');
    printLines(lines);

    console.log('\nPer-segment alignment:');
    for (const seg of perSegment) {
      const text = seg.words.map((w) => w.text).join(' ');
      console.log(
        `  Segment ${seg.segmentIndex}: ${seg.startSec.toFixed(2)}s - ${seg.endSec.toFixed(2)}s  "${text}"`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
