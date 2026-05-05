import { describe, it, expect } from 'vitest';
import { parsePatterns } from '../parser/index.js';

// ---------------------------------------------------------------------------
// Fixture 1: Valid markdown with all sections
// ---------------------------------------------------------------------------

const fixture1 = `
# APEX — Services

## Hooks
- Cuántas líneas de código necesitás para lanzar un SaaS completo?
- Este error te cuesta horas todos los días y ni lo sabés
- ¿Sabes cuánto dinero perdés por no automatizar esto?

## Formats
- Speed Build (60-90s): Construí X en tiempo real
- Hot Take (30-45s): Una opinión polémica sobre el desarrollo

## Topics
- Automatización de workflows
- Errores comunes de arquitectura
- Performance en producción

## Pacing
audioSpeedMultiplier: 1.0-1.2
cutEverySec: 2-4
ideaDensitySec: 3
musicBpm: 120-140
voiceLufs: -14
musicLufs: -20
duckingDb: -12

## Visual Elements
- Code reveal animations (retentionLift: 0.3)
- Terminal output overlays

## CTAs
- Seguí para más tips
- Comentá tu mayor pain point

## Hashtags
### Reels
#programacion #desarrollo #saas
### TikTok
#devtips #coding #software
### Shorts
#programming #developer #tech

## Captions
### single_tip
{hook}
{value}
{cta}

### hot_take
💥 {hook}
{value}
→ {cta}
`.trim();

// ---------------------------------------------------------------------------
// Fixture 2: Markdown with missing hooks section
// ---------------------------------------------------------------------------

const fixture2 = `
# Project Without Hooks

## Formats
- Speed Build (30-60s): Demo en vivo

## Topics
- Productividad
`.trim();

// ---------------------------------------------------------------------------
// Fixture 3: Valid JSON
// ---------------------------------------------------------------------------

const fixture3 = JSON.stringify({
  projectId: 'test-project',
  hooks: [
    {
      id: 'h1',
      text: '¿Sabés cuánto tiempo perdés con esto?',
      type: 'curiosity_gap',
      estimatedEngagement: 'high',
      bestPlatforms: ['reels', 'tiktok'],
      exampleTopics: ['productividad'],
      language: 'es',
    },
  ],
  formats: [
    {
      id: 'f1',
      name: 'Speed Build',
      description: 'Demo en tiempo real',
      optimalDurationSec: { min: 30, max: 60 },
      bestPlatforms: ['reels'],
      structureSegments: ['hook 0-3s', 'build 3-55s', 'cta 55-60s'],
    },
  ],
  topics: [
    {
      id: 't1',
      name: 'Automatización',
      category: 'workflow',
      dominantEmotion: 'curiosity',
      productionDifficulty: 2,
      relatedHookIds: ['h1'],
    },
  ],
  pacing: {
    audioSpeedMultiplier: { min: 1.0, max: 1.2 },
    cutEverySec: { min: 2, max: 4 },
    ideaDensitySec: 3,
    musicBpm: { min: 120, max: 140 },
    voiceLufs: -14,
    musicLufs: -20,
    duckingDb: -12,
  },
  visualElements: [],
  ctaTemplates: ['Seguí para más'],
  hashtags: {
    reels: ['#dev'],
    tiktok: ['#dev'],
    shorts: ['#dev'],
  },
  captionTemplates: {},
  language: 'es',
  parsedAt: '2025-01-01T00:00:00.000Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parsePatterns — markdown (fixture 1)', () => {
  it('returns ok: true for valid markdown with all sections', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    expect(result.ok).toBe(true);
  });

  it('data.hooks.length >= 1', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(result.data.hooks.length).toBeGreaterThanOrEqual(1);
  });

  it('data.formats.length >= 1', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(result.data.formats.length).toBeGreaterThanOrEqual(1);
  });

  it('data.projectId === "test-project"', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(result.data.projectId).toBe('test-project');
  });

  it('data.parsedAt is a valid ISO string', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    const date = new Date(result.data.parsedAt);
    expect(isNaN(date.getTime())).toBe(false);
    expect(result.data.parsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('data.language is a string', () => {
    const result = parsePatterns({ source: fixture1, mimeType: 'text/markdown', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(typeof result.data.language).toBe('string');
  });
});

describe('parsePatterns — markdown (fixture 2, missing hooks)', () => {
  it('returns ok: false when hooks section is missing', () => {
    const result = parsePatterns({ source: fixture2, mimeType: 'text/markdown', projectId: 'test-project' });
    expect(result.ok).toBe(false);
  });

  it('error message contains "hooks"', () => {
    const result = parsePatterns({ source: fixture2, mimeType: 'text/markdown', projectId: 'test-project' });
    if (result.ok) throw new Error('Expected ok: false');
    expect(result.error).toContain('hooks');
  });
});

describe('parsePatterns — JSON (fixture 3)', () => {
  it('returns ok: true for valid JSON', () => {
    const result = parsePatterns({ source: fixture3, mimeType: 'application/json', projectId: 'test-project' });
    expect(result.ok).toBe(true);
  });

  it('data.hooks[0].type === "curiosity_gap"', () => {
    const result = parsePatterns({ source: fixture3, mimeType: 'application/json', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(result.data.hooks[0]?.type).toBe('curiosity_gap');
  });

  it('data.formats[0].name === "Speed Build"', () => {
    const result = parsePatterns({ source: fixture3, mimeType: 'application/json', projectId: 'test-project' });
    if (!result.ok) throw new Error('Expected ok: true');
    expect(result.data.formats[0]?.name).toBe('Speed Build');
  });
});
