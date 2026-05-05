import { describe, it, expect } from 'vitest';
import { buildPrompts, seedFromVideoId } from '../build.js';
import { NEGATIVE_PROMPT, STYLE_NAME } from '../style.js';
import type { ScriptOutput } from '../../../ai/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleScript: ScriptOutput = {
  segments: [
    {
      index: 0,
      role: 'hook',
      startSec: 0,
      endSec: 2,
      voiceover: 'Mirá esto.',
      onScreenText: '¿Sabías esto?',
      visualCue: 'monitor en penumbra',
    },
    {
      index: 1,
      role: 'setup',
      startSec: 2,
      endSec: 6,
      voiceover: 'El problema es X.',
      visualCue: 'código en pantalla',
    },
    {
      index: 2,
      role: 'reveal',
      startSec: 6,
      endSec: 10,
      voiceover: 'La solución es Y.',
      onScreenText: 'Usá Y.',
      visualCue: 'reveal',
    },
    {
      index: 3,
      role: 'cta',
      startSec: 10,
      endSec: 12,
      voiceover: 'Seguime.',
      onScreenText: 'Seguime.',
      visualCue: 'cta',
    },
  ],
  totalDurationSec: 30,
  recommendedTemplate: 'tip',
  themeColor: '#3ECF8E',
  musicMood: 'synthwave',
};

const baseInput = {
  script: sampleScript,
  themeColor: '#3ECF8E',
  language: 'es-AR',
  template: 'tip',
  seed: 42,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPrompts', () => {
  it('returns three string prompts (hook/reveal/cta)', () => {
    const out = buildPrompts(baseInput);
    expect(typeof out.hook).toBe('string');
    expect(typeof out.reveal).toBe('string');
    expect(typeof out.cta).toBe('string');
    expect(out.hook.length).toBeGreaterThan(20);
    expect(out.reveal.length).toBeGreaterThan(20);
    expect(out.cta.length).toBeGreaterThan(20);
  });

  it('is deterministic for the same seed + inputs', () => {
    const a = buildPrompts(baseInput);
    const b = buildPrompts(baseInput);
    expect(a).toEqual(b);
  });

  it('produces different prompts for different seeds', () => {
    const a = buildPrompts({ ...baseInput, seed: 1 });
    const b = buildPrompts({ ...baseInput, seed: 99 });
    // At least one of the slots must differ across seeds (very high probability
    // given multiple independent picks per slot).
    const allSame = a.hook === b.hook && a.reveal === b.reveal && a.cta === b.cta;
    expect(allSame).toBe(false);
  });

  it('embeds the themeColor in every slot', () => {
    const out = buildPrompts(baseInput);
    expect(out.hook).toContain('#3ECF8E');
    expect(out.reveal).toContain('#3ECF8E');
    expect(out.cta).toContain('#3ECF8E');
  });

  it('produces different prompts for different theme colors', () => {
    const a = buildPrompts(baseInput);
    const b = buildPrompts({ ...baseInput, themeColor: '#FF00FF' });
    expect(a.hook).not.toBe(b.hook);
    expect(a.reveal).not.toBe(b.reveal);
    expect(a.cta).not.toBe(b.cta);
  });

  it('always includes the cinematic-dev-noir style tag in every slot', () => {
    const out = buildPrompts(baseInput);
    expect(out.hook).toContain(STYLE_NAME);
    expect(out.reveal).toContain(STYLE_NAME);
    expect(out.cta).toContain(STYLE_NAME);
  });

  it('always appends the negative prompt to every slot', () => {
    const out = buildPrompts(baseInput);
    expect(out.hook).toContain(NEGATIVE_PROMPT);
    expect(out.reveal).toContain(NEGATIVE_PROMPT);
    expect(out.cta).toContain(NEGATIVE_PROMPT);
  });

  it('uses the reveal segment text as the symbolic anchor for reveal prompt', () => {
    const out = buildPrompts(baseInput);
    // sampleScript.reveal.onScreenText = 'Usá Y.'
    expect(out.reveal).toContain('Usá Y.');
  });

  it('falls back to brandOneLiner when reveal segment has no text', () => {
    const scriptNoReveal: ScriptOutput = {
      ...sampleScript,
      segments: sampleScript.segments.filter((s) => s.role !== 'reveal'),
    };
    const out = buildPrompts({
      ...baseInput,
      script: scriptNoReveal,
      brandOneLiner: 'Mi brand killer',
    });
    expect(out.reveal).toContain('Mi brand killer');
  });

  it('falls back to a generic anchor when neither reveal nor brandOneLiner exist', () => {
    const scriptNoReveal: ScriptOutput = {
      ...sampleScript,
      segments: sampleScript.segments.filter((s) => s.role !== 'reveal'),
    };
    const out = buildPrompts({ ...baseInput, script: scriptNoReveal });
    expect(out.reveal).toContain('a key insight');
  });
});

describe('seedFromVideoId', () => {
  it('is deterministic', () => {
    const a = seedFromVideoId('abc-def-123');
    const b = seedFromVideoId('abc-def-123');
    expect(a).toBe(b);
  });

  it('returns a non-negative integer', () => {
    const s = seedFromVideoId('any-uuid-here');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it('produces different seeds for different ids', () => {
    const a = seedFromVideoId('aaaa');
    const b = seedFromVideoId('bbbb');
    expect(a).not.toBe(b);
  });
});
