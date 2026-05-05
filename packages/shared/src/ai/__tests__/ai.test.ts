import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { IdeasOutputSchema } from '../prompts/idea-generator.js';
import { ScriptOutputSchema } from '../prompts/script-writer.js';
import { CaptionOutputSchema } from '../prompts/caption-writer.js';
import { HookRewriterOutputSchema } from '../prompts/hook-rewriter.js';

// ----------- Idea Generator -----------

describe('IdeasOutputSchema', () => {
  it('accepts valid 5-idea output', () => {
    const valid = {
      ideas: Array.from({ length: 5 }, (_, i) => ({
        hook: `Hook ${i}`,
        angle: `Ángulo ${i}`,
        format: 'tip',
        estimatedDurationSec: 30,
        targetEmotion: 'immediate_value',
        rationale: 'Funciona porque...',
        riskLevel: 'safe',
      })),
    };
    expect(() => IdeasOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects fewer than 5 ideas', () => {
    const bad = {
      ideas: [
        {
          hook: 'Solo uno',
          angle: 'Ángulo',
          format: 'tip',
          estimatedDurationSec: 30,
          targetEmotion: 'immediate_value',
          rationale: 'Razón',
          riskLevel: 'safe',
        },
      ],
    };
    expect(() => IdeasOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects invalid format enum', () => {
    const bad = {
      ideas: Array.from({ length: 5 }, () => ({
        hook: 'Hook',
        angle: 'Ángulo',
        format: 'invalid_format',
        estimatedDurationSec: 30,
        targetEmotion: 'immediate_value',
        rationale: 'Razón',
        riskLevel: 'safe',
      })),
    };
    expect(() => IdeasOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects invalid riskLevel', () => {
    const bad = {
      ideas: Array.from({ length: 5 }, () => ({
        hook: 'Hook',
        angle: 'Ángulo',
        format: 'tip',
        estimatedDurationSec: 30,
        targetEmotion: 'immediate_value',
        rationale: 'Razón',
        riskLevel: 'medium',
      })),
    };
    expect(() => IdeasOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects duration out of range', () => {
    const bad = {
      ideas: Array.from({ length: 5 }, () => ({
        hook: 'Hook',
        angle: 'Ángulo',
        format: 'tip',
        estimatedDurationSec: 120,
        targetEmotion: 'immediate_value',
        rationale: 'Razón',
        riskLevel: 'safe',
      })),
    };
    expect(() => IdeasOutputSchema.parse(bad)).toThrow(z.ZodError);
  });
});

// ----------- Script Writer — duration validation -----------

describe('ScriptOutputSchema — duration validation', () => {
  const makeSegments = (pairs: [number, number][], role = 'hook') =>
    pairs.map(([startSec, endSec], index) => ({
      index,
      role: index === 0 ? 'hook' : index === pairs.length - 1 ? 'cta' : role,
      startSec,
      endSec,
      voiceover: `Voiceover ${index}`,
      visualCue: `Visual ${index}`,
    }));

  it('accepts valid script with matching totalDurationSec', () => {
    const valid = {
      segments: makeSegments([
        [0, 2],
        [2, 6],
        [6, 18],
        [18, 24],
        [24, 28],
        [28, 30],
      ]),
      totalDurationSec: 30,
      recommendedTemplate: 'tip',
      themeColor: '#FF5733',
      musicMood: 'lofi',
    };
    expect(() => ScriptOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects totalDurationSec below minimum', () => {
    const bad = {
      segments: makeSegments([[0, 10], [10, 14]]),
      totalDurationSec: 14,
      recommendedTemplate: 'tip',
      themeColor: '#FF5733',
      musicMood: 'lofi',
    };
    expect(() => ScriptOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects totalDurationSec above maximum', () => {
    const bad = {
      segments: makeSegments([[0, 30], [30, 61]]),
      totalDurationSec: 61,
      recommendedTemplate: 'tip',
      themeColor: '#FF5733',
      musicMood: 'lofi',
    };
    expect(() => ScriptOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects invalid themeColor hex', () => {
    const bad = {
      segments: makeSegments([[0, 2], [2, 30]]),
      totalDurationSec: 30,
      recommendedTemplate: 'tip',
      themeColor: 'red',
      musicMood: 'lofi',
    };
    expect(() => ScriptOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects invalid musicMood', () => {
    const bad = {
      segments: makeSegments([[0, 2], [2, 30]]),
      totalDurationSec: 30,
      recommendedTemplate: 'tip',
      themeColor: '#FFFFFF',
      musicMood: 'jazz',
    };
    expect(() => ScriptOutputSchema.parse(bad)).toThrow(z.ZodError);
  });
});

// ----------- Caption Writer — hashtag limits -----------

describe('CaptionOutputSchema — hashtag limits', () => {
  const makeCaption = (
    instagramTags: string[],
    tiktokTags: string[],
    shortsTags: string[],
  ) => ({
    instagram: { caption: 'Caption de Reels', hashtags: instagramTags },
    tiktok: { caption: 'Caption de TikTok', hashtags: tiktokTags },
    shorts: { caption: 'Caption de Shorts', hashtags: shortsTags },
  });

  it('accepts max hashtag limits per platform', () => {
    const valid = makeCaption(
      Array.from({ length: 12 }, (_, i) => `tag${i}`),
      Array.from({ length: 5 }, (_, i) => `ttag${i}`),
      Array.from({ length: 3 }, (_, i) => `stag${i}`),
    );
    expect(() => CaptionOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects more than 12 hashtags for instagram', () => {
    const bad = makeCaption(
      Array.from({ length: 13 }, (_, i) => `tag${i}`),
      ['ttag1'],
      ['stag1'],
    );
    expect(() => CaptionOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects more than 5 hashtags for tiktok', () => {
    const bad = makeCaption(
      ['tag1'],
      Array.from({ length: 6 }, (_, i) => `ttag${i}`),
      ['stag1'],
    );
    expect(() => CaptionOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects more than 3 hashtags for shorts', () => {
    const bad = makeCaption(
      ['tag1'],
      ['ttag1'],
      Array.from({ length: 4 }, (_, i) => `stag${i}`),
    );
    expect(() => CaptionOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('accepts empty hashtag arrays', () => {
    const valid = makeCaption([], [], []);
    expect(() => CaptionOutputSchema.parse(valid)).not.toThrow();
  });
});

// ----------- Hook Rewriter -----------

describe('HookRewriterOutputSchema', () => {
  it('accepts exactly 5 variants', () => {
    const valid = {
      variants: Array.from({ length: 5 }, (_, i) => ({
        hook: `Variante ${i}`,
        explanation: `Técnica usada: curiosity_gap`,
      })),
    };
    expect(() => HookRewriterOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects fewer than 5 variants', () => {
    const bad = {
      variants: [{ hook: 'Solo uno', explanation: 'Técnica X' }],
    };
    expect(() => HookRewriterOutputSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects more than 5 variants', () => {
    const bad = {
      variants: Array.from({ length: 6 }, (_, i) => ({
        hook: `Variante ${i}`,
        explanation: `Técnica ${i}`,
      })),
    };
    expect(() => HookRewriterOutputSchema.parse(bad)).toThrow(z.ZodError);
  });
});
