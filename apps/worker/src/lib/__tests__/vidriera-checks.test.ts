import { describe, it, expect } from 'vitest';
import {
  renderDurationOk,
  captionMentionsDemo,
  evaluateFailSafes,
  type FailSafeInput,
} from '../vidriera-checks.js';

describe('renderDurationOk', () => {
  it('accepts an exact match', () => {
    expect(renderDurationOk(24, 24)).toBe(true);
  });

  it('accepts a small gap within the default tolerance', () => {
    expect(renderDurationOk(24.3, 24)).toBe(true);
  });

  it('rejects a gross mismatch (broken render)', () => {
    expect(renderDurationOk(2, 24)).toBe(false);
  });

  it('honours an explicit tolerance', () => {
    expect(renderDurationOk(24.04, 24, 0.05)).toBe(true);
    expect(renderDurationOk(24.2, 24, 0.05)).toBe(false);
  });
});

describe('captionMentionsDemo', () => {
  it('flags the bare word "demo"', () => {
    expect(captionMentionsDemo('Mirá esta demo de la app')).toBe(true);
  });

  it('flags it case-insensitively and in plural', () => {
    expect(captionMentionsDemo('Nuestras DEMOS están listas')).toBe(true);
  });

  it('does NOT flag a clean client-style caption', () => {
    expect(captionMentionsDemo('Nebula: analytics con IA, a medida. Hablemos.')).toBe(false);
  });

  it('does NOT flag the legit word "demostración"', () => {
    expect(captionMentionsDemo('Una demostración de poder de cómputo')).toBe(false);
  });
});

function baseInput(overrides: Partial<FailSafeInput> = {}): FailSafeInput {
  return {
    demoUrlStatus: 200,
    renderSec: 24,
    audioSec: 24,
    renderHasAudioTrack: true,
    scriptText: 'Un guion de voz en off lo bastante largo como para subtitular bien.',
    caption: 'Nebula, a medida. Lo hicimos en APEX. Hablemos.',
    ...overrides,
  };
}

describe('evaluateFailSafes', () => {
  it('passes when everything is healthy', () => {
    const r = evaluateFailSafes(baseInput());
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('fails when the demo URL did not load', () => {
    const r = evaluateFailSafes(baseInput({ demoUrlStatus: 404 }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/url/i);
  });

  it('fails when the render duration does not match the audio', () => {
    const r = evaluateFailSafes(baseInput({ renderSec: 3 }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/duration/i);
  });

  it('fails when the render has no audio track', () => {
    const r = evaluateFailSafes(baseInput({ renderHasAudioTrack: false }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/audio/i);
  });

  it('fails when the subtitle source (script) is empty', () => {
    const r = evaluateFailSafes(baseInput({ scriptText: '   ' }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/subtitle|script/i);
  });

  it('fails when the caption says "demo"', () => {
    const r = evaluateFailSafes(baseInput({ caption: 'Esta demo te va a encantar' }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toMatch(/demo/i);
  });

  it('reports every failure at once', () => {
    const r = evaluateFailSafes(
      baseInput({ demoUrlStatus: 500, renderHasAudioTrack: false, scriptText: '' }),
    );
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(3);
  });
});
