import { describe, it, expect } from 'vitest';
import { hashHook, hashTopic, hashAngle } from '../engine/hashing.js';
import { passesAntiRepeat } from '../engine/anti-repeat.js';
import { suggest } from '../engine/suggest.js';
import { buildCaption } from '../engine/captions.js';
import type { ProjectPatterns, ProjectBrand } from '../types.js';

// ---------------------------------------------------------------------------
// hashHook — determinism tests
// ---------------------------------------------------------------------------

describe('hashHook — determinism', () => {
  it('produces the same result for the same input', async () => {
    const h1 = await hashHook('test hook text');
    const h2 = await hashHook('test hook text');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(16);
  });

  it('produces different results for different inputs', async () => {
    const h1 = await hashHook('hook a');
    const h2 = await hashHook('hook b');
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// passesAntiRepeat
// ---------------------------------------------------------------------------

describe('passesAntiRepeat', () => {
  it('returns true when no recent signatures', () => {
    const result = passesAntiRepeat(
      { hookHash: 'abc123', topicHash: 'def456', angleHash: 'ghi789' },
      []
    );
    expect(result).toBe(true);
  });

  it('returns false when hookHash used within 14 days', () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
    const result = passesAntiRepeat(
      { hookHash: 'abc123', topicHash: 'def456', angleHash: 'ghi789' },
      [{ hookHash: 'abc123', topicHash: 'other', angleHash: 'other2', usedAt: recentDate }]
    );
    expect(result).toBe(false);
  });

  it('returns true when hookHash used outside the 14-day window', () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(); // 20 days ago
    const result = passesAntiRepeat(
      { hookHash: 'abc123', topicHash: 'def456', angleHash: 'ghi789' },
      [{ hookHash: 'abc123', topicHash: 'other', angleHash: 'other2', usedAt: oldDate }]
    );
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// suggest — no_candidates
// ---------------------------------------------------------------------------

describe('suggest', () => {
  it('suggest returns a valid SuggestOutput on happy path', async () => {
    const patterns: ProjectPatterns = {
      projectId: 'test',
      hooks: [
        {
          id: 'h1',
          text: 'unique happy path hook text',
          type: 'curiosity_gap',
          estimatedEngagement: 'high',
          bestPlatforms: ['reels', 'tiktok', 'shorts'],
          exampleTopics: [],
          language: 'es'
        }
      ],
      formats: [
        {
          id: 'f1',
          name: 'Speed Build',
          description: 'Demo en tiempo real',
          optimalDurationSec: { min: 30, max: 60 },
          bestPlatforms: ['reels'],
          structureSegments: ['hook 0-3s', 'build 3-25s', 'cta 25-30s']
        }
      ],
      topics: [
        {
          id: 't1',
          name: 'unique happy path topic name',
          category: 'workflow',
          dominantEmotion: 'curiosity',
          productionDifficulty: 2,
          relatedHookIds: ['h1']
        }
      ],
      pacing: {
        audioSpeedMultiplier: { min: 1, max: 1.2 },
        cutEverySec: { min: 2, max: 4 },
        ideaDensitySec: 3,
        musicBpm: { min: 120, max: 140 },
        voiceLufs: -14,
        musicLufs: -20,
        duckingDb: -12
      },
      visualElements: [],
      ctaTemplates: [],
      hashtags: { reels: [], tiktok: [], shorts: [] },
      captionTemplates: {} as Record<string, string>,
      language: 'es',
      parsedAt: new Date().toISOString(),
    };

    const brand: ProjectBrand = {
      projectId: 'test',
      brandName: 'Test Brand',
      oneLiner: 'Test service',
      audience: { who: 'developers', where: 'online', pains: ['time'] },
      valueProps: [],
      features: [],
      caseStudies: [],
      voiceTone: 'direct',
      ctas: [],
      doNotSay: [],
      parsedAt: new Date().toISOString(),
    };

    const output = await suggest({
      patterns,
      brand,
      recentSignatures: [],  // no filtering
    });

    expect(output.hook).toBeDefined();
    expect(output.hook.text).toBe('unique happy path hook text');
    expect(output.topic).toBeDefined();
    expect(output.topic.name).toBe('unique happy path topic name');
    expect(output.format).toBeDefined();
    expect(output.structure.length).toBeGreaterThan(0);
    expect(output.signature.hookHash).toHaveLength(16);
    expect(output.signature.topicHash).toHaveLength(16);
    expect(output.signature.angleHash).toHaveLength(16);
    expect(output.rationale).toBeTruthy();
  });

  it('throws no_candidates when all hooks and topics are filtered by anti-repeat', async () => {
    const patterns: ProjectPatterns = {
      projectId: 'test',
      hooks: [
        {
          id: 'h1',
          text: 'test hook',
          type: 'curiosity_gap',
          estimatedEngagement: 'high',
          bestPlatforms: ['reels'],
          exampleTopics: [],
          language: 'es',
        },
      ],
      formats: [
        {
          id: 'f1',
          name: 'Speed Build',
          description: 'Demo',
          optimalDurationSec: { min: 30, max: 60 },
          bestPlatforms: ['reels'],
          structureSegments: [],
        },
      ],
      topics: [
        {
          id: 't1',
          name: 'test topic',
          category: 'test',
          dominantEmotion: 'curiosity',
          productionDifficulty: 2,
          relatedHookIds: ['h1'],
        },
      ],
      pacing: {
        audioSpeedMultiplier: { min: 1, max: 1.2 },
        cutEverySec: { min: 2, max: 4 },
        ideaDensitySec: 3,
        musicBpm: { min: 120, max: 140 },
        voiceLufs: -14,
        musicLufs: -20,
        duckingDb: -12,
      },
      visualElements: [],
      ctaTemplates: [],
      hashtags: { reels: [], tiktok: [], shorts: [] },
      captionTemplates: {} as Record<string, string>,
      language: 'es',
      parsedAt: new Date().toISOString(),
    };

    const brand: ProjectBrand = {
      projectId: 'test',
      brandName: 'Test Brand',
      oneLiner: 'Test',
      audience: { who: 'developers', where: 'online', pains: ['time'] },
      valueProps: [],
      features: [],
      caseStudies: [],
      voiceTone: 'direct',
      ctas: [],
      doNotSay: [],
      parsedAt: new Date().toISOString(),
    };

    // Pre-compute hashes to filter all candidates within their windows
    const hookHash = await hashHook('test hook');
    const topicHash = await hashTopic('test topic');
    const angleHash = await hashAngle('test hook', 'test topic');

    await expect(
      suggest({
        patterns,
        brand,
        recentSignatures: [
          { hookHash, topicHash, angleHash, usedAt: new Date().toISOString() },
        ],
      })
    ).rejects.toMatchObject({ code: 'no_candidates' });
  });
});

// ---------------------------------------------------------------------------
// buildCaption
// ---------------------------------------------------------------------------

describe('buildCaption', () => {
  it('replaces all placeholders correctly', () => {
    const result = buildCaption(
      '{hook}\n{value}\n{cta}',
      { hook: 'HOOK_CONTENT', value: 'VALUE_CONTENT', cta: 'CTA_CONTENT' },
      ['#tag1', '#tag2']
    );
    expect(result).toContain('HOOK_CONTENT');
    expect(result).toContain('VALUE_CONTENT');
    expect(result).toContain('CTA_CONTENT');
    expect(result).toContain('#tag1');
    expect(result).not.toContain('{hook}');
    expect(result).not.toContain('{value}');
    expect(result).not.toContain('{cta}');
  });

  it('handles $& in replacement data without expanding regex back-reference', () => {
    const result = buildCaption('{hook}', { hook: '$&tricky', value: '', cta: '' }, []);
    expect(result).toContain('$&tricky');
  });
});
