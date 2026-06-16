import { describe, it, expect } from 'vitest';
import { tokenizeScript, buildCorrectedTranscript } from '../editor-machine.js';

describe('tokenizeScript', () => {
  it('splits on whitespace and strips edge punctuation', () => {
    expect(tokenizeScript('Coordinar por WhatsApp… ya fue.')).toEqual([
      'Coordinar',
      'por',
      'WhatsApp',
      'ya',
      'fue',
    ]);
  });

  it('keeps internal punctuation and digits', () => {
    expect(tokenizeScript('Probala 15 días, sin tarjeta.')).toEqual([
      'Probala',
      '15',
      'días',
      'sin',
      'tarjeta',
    ]);
  });

  it('collapses multiple spaces and newlines', () => {
    expect(tokenizeScript('hola\n\n  mundo')).toEqual(['hola', 'mundo']);
  });
});

describe('buildCorrectedTranscript', () => {
  const whisper = {
    text: 'sin voz en el medio',
    language: 'es',
    words: [
      { w: 'sin', s: 0, e: 0.3 },
      { w: 'voz', s: 0.3, e: 0.6 }, // Whisper homophone error: should be "vos"
      { w: 'en', s: 0.6, e: 0.7 },
      { w: 'el', s: 0.7, e: 0.8 },
      { w: 'medio', s: 0.8, e: 1.2 },
    ],
  };

  it('rewrites word text to the exact script, keeping timings (1:1)', () => {
    const out = buildCorrectedTranscript(whisper, 'Sin vos en el medio.');
    expect(out).not.toBeNull();
    expect(out!.words!.map((w) => w.w)).toEqual(['Sin', 'vos', 'en', 'el', 'medio']);
    // timings are preserved verbatim from Whisper
    expect(out!.words!.map((w) => [w.s, w.e])).toEqual([
      [0, 0.3],
      [0.3, 0.6],
      [0.6, 0.7],
      [0.7, 0.8],
      [0.8, 1.2],
    ]);
    expect(out!.text).toBe('Sin vos en el medio.');
  });

  it('returns null when word counts differ (safe fallback → keep Whisper)', () => {
    expect(buildCorrectedTranscript(whisper, 'Sin vos')).toBeNull();
    expect(buildCorrectedTranscript(whisper, 'Sin vos en el medio del cuarto')).toBeNull();
  });

  it('returns null when there are no Whisper words', () => {
    expect(buildCorrectedTranscript({ words: [] }, 'hola mundo')).toBeNull();
    expect(buildCorrectedTranscript(null, 'hola mundo')).toBeNull();
  });
});
