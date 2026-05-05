import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { __setAdminClientForTests } from '../../lib/supabase.js';
import { getRecentSignatures } from '../anti-repeat-query.js';
import { persistSignature } from '../anti-repeat-persist.js';
import { findSemanticDuplicates, __setAnthropicClientForSimilarityTests } from '../anti-repeat-similarity.js';
import { suggestWithAntiRepeat } from '../anti-repeat-policy.js';
import { DEFAULT_POLICY, passesAntiRepeat } from '@virus/shared/viral';
import type { RecentSignature as SharedRecentSignature } from '@virus/shared/viral';

// ---------------------------------------------------------------------------
// Test 1: getRecentSignatures returns empty array when no rows
// ---------------------------------------------------------------------------

describe('getRecentSignatures', () => {
  beforeEach(() => {
    const fakeClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    __setAdminClientForTests(fakeClient as never);
  });

  afterEach(() => {
    __setAdminClientForTests(null);
    vi.restoreAllMocks();
  });

  it('returns empty array when no rows exist', async () => {
    const result = await getRecentSignatures({ projectId: 'proj-1' });
    expect(result).toEqual([]);
  });

  it('maps rows correctly and coerces null hookText to empty string', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              hook_hash: 'aabbccdd11223344',
              topic_hash: 'eeff00112233aabb',
              angle_hash: 'ccdd11223344eeff',
              hook_text: null,
              topic_name: 'Auth',
              format: 'reel_60',
              used_at: '2026-04-20T10:00:00Z',
            },
          ],
          error: null,
        }),
      }),
    };
    __setAdminClientForTests(fakeClient as never);

    const result = await getRecentSignatures({ projectId: 'proj-1' });
    expect(result).toHaveLength(1);
    expect(result[0]!.hookText).toBe('');
    expect(result[0]!.topicName).toBe('Auth');
  });
});

// ---------------------------------------------------------------------------
// Test 2: hash filter blocks exact reuse
// ---------------------------------------------------------------------------

describe('passesAntiRepeat — hash filter', () => {
  it('blocks a candidate whose hookHash matches a recent signature within window', () => {
    const recent: SharedRecentSignature[] = [
      {
        hookHash: 'aabbccdd11223344',
        topicHash: 'different',
        angleHash: 'different',
        usedAt: new Date().toISOString(), // just now — within 14-day window
      },
    ];

    const candidate = {
      hookHash: 'aabbccdd11223344', // same hook
      topicHash: 'newtopic',
      angleHash: 'newangle',
    };

    expect(passesAntiRepeat(candidate, recent)).toBe(false);
  });

  it('passes a candidate whose hookHash is outside the window', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent: SharedRecentSignature[] = [
      {
        hookHash: 'aabbccdd11223344',
        topicHash: 'different',
        angleHash: 'different',
        usedAt: old,
      },
    ];

    const candidate = {
      hookHash: 'aabbccdd11223344',
      topicHash: 'newtopic',
      angleHash: 'newangle',
    };

    expect(passesAntiRepeat(candidate, recent)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: semantic filter — Auth0 rewordings detected
// ---------------------------------------------------------------------------

describe('findSemanticDuplicates', () => {
  afterEach(() => {
    __setAnthropicClientForSimilarityTests(null);
    vi.restoreAllMocks();
  });

  it('detects Auth0 rewordings as duplicates', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([{ index: 0, similarity: 0.92, reason: 'Same concept, rephrased' }]),
            },
          ],
        }),
      },
    };
    __setAnthropicClientForSimilarityTests(fakeClient as never);

    const result = await findSemanticDuplicates({
      candidate: { hook: 'No uses Auth0 en tu MVP', topic: 'Auth' },
      recent: [
        {
          hookHash: 'aabbccdd11223344',
          topicHash: 'eeff00112233aabb',
          angleHash: 'ccdd11223344eeff',
          hookText: 'Tu MVP no necesita Auth0',
          topicName: 'Auth',
          format: 'reel_60',
          usedAt: new Date().toISOString(),
        },
      ],
      threshold: 0.85,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.similarity).toBe(0.92);
  });

  // -------------------------------------------------------------------------
  // Test 4: different topics, same wording — not duplicate
  // -------------------------------------------------------------------------

  it('does not flag low-similarity response as duplicate', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([{ index: 0, similarity: 0.3, reason: 'Different domain' }]),
            },
          ],
        }),
      },
    };
    __setAnthropicClientForSimilarityTests(fakeClient as never);

    const result = await findSemanticDuplicates({
      candidate: { hook: 'How to build a SaaS', topic: 'SaaS' },
      recent: [
        {
          hookHash: 'ffffeeeeddddcccc',
          topicHash: '111122223333aaaa',
          angleHash: 'bbbbccccddddeeee',
          hookText: 'How to bake a cake',
          topicName: 'Cooking',
          format: 'reel_30',
          usedAt: new Date().toISOString(),
        },
      ],
      threshold: 0.85,
    });

    expect(result.isDuplicate).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 5: Claude failure → fallback (not blocking)
  // -------------------------------------------------------------------------

  it('returns isDuplicate: false when Claude throws — never blocks generation', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('Claude API timeout')),
      },
    };
    __setAnthropicClientForSimilarityTests(fakeClient as never);

    const result = await findSemanticDuplicates({
      candidate: { hook: 'Some hook', topic: 'Some topic' },
      recent: [
        {
          hookHash: 'aaaabbbbccccdddd',
          topicHash: 'eeeeffff00001111',
          angleHash: '22223333444455556666',
          hookText: 'Another hook',
          topicName: 'Another topic',
          format: 'reel_60',
          usedAt: new Date().toISOString(),
        },
      ],
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it('returns immediately with no-duplicate when recent is empty', async () => {
    const fakeClient = {
      messages: { create: vi.fn() },
    };
    __setAnthropicClientForSimilarityTests(fakeClient as never);

    const result = await findSemanticDuplicates({
      candidate: { hook: 'Any hook', topic: 'Any topic' },
      recent: [],
    });

    expect(result.isDuplicate).toBe(false);
    expect(fakeClient.messages.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 6: persistSignature is idempotent
// ---------------------------------------------------------------------------

describe('persistSignature', () => {
  let upsertMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsertMock = vi.fn().mockResolvedValue({ data: [{}], error: null });
    const fakeClient = {
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    };
    __setAdminClientForTests(fakeClient as never);
  });

  afterEach(() => {
    __setAdminClientForTests(null);
    vi.restoreAllMocks();
  });

  it('calls upsert twice for idempotent behavior on same videoId', async () => {
    const payload = {
      projectId: 'proj-1',
      videoId: 'video-uuid-001',
      hookHash: 'aabbccdd11223344',
      topicHash: 'eeff00112233aabb',
      angleHash: 'ccdd11223344eeff',
      hookText: 'No uses Auth0 en tu MVP',
      topicName: 'Auth',
      format: 'reel_60',
    };

    await persistSignature(payload);
    await persistSignature(payload);

    expect(upsertMock).toHaveBeenCalledTimes(2);

    const [row, opts] = upsertMock.mock.calls[0]!;
    expect(row.video_id).toBe('video-uuid-001');
    expect(row.project_id).toBe('proj-1');
    expect(opts).toEqual({ onConflict: 'video_id' });
  });
});

// ---------------------------------------------------------------------------
// Test 7: suggestWithAntiRepeat with fallback: 'force'
// ---------------------------------------------------------------------------

describe('suggestWithAntiRepeat', () => {
  afterEach(() => {
    __setAdminClientForTests(null);
    __setAnthropicClientForSimilarityTests(null);
    vi.restoreAllMocks();
  });

  it('returns a SuggestOutput when no duplicates detected', async () => {
    // Supabase mock returns empty recent signatures
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    __setAdminClientForTests(fakeSupabase as never);

    // Anthropic: similarity always 0 → never duplicate
    const fakeAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
        }),
      },
    };
    __setAnthropicClientForSimilarityTests(fakeAnthropic as never);

    const patterns = {
      projectId: 'proj-1',
      hooks: [
        {
          id: 'h-1',
          text: 'No uses Auth0 en tu MVP',
          type: 'shock_contrarian' as const,
          estimatedEngagement: 'high' as const,
          bestPlatforms: ['reels' as const],
          exampleTopics: [],
          language: 'es',
        },
      ],
      formats: [
        {
          id: 'f-1',
          name: 'Reel 60s',
          description: 'Short reel',
          optimalDurationSec: { min: 55, max: 65 },
          bestPlatforms: ['reels' as const],
          structureSegments: [],
        },
      ],
      topics: [
        {
          id: 't-1',
          name: 'Auth',
          category: 'tech',
          dominantEmotion: 'relief',
          productionDifficulty: 2 as const,
          relatedHookIds: ['h-1'],
        },
      ],
      pacing: {
        audioSpeedMultiplier: { min: 1, max: 1.2 },
        cutEverySec: { min: 3, max: 5 },
        ideaDensitySec: 4,
        musicBpm: { min: 80, max: 120 },
        voiceLufs: -15,
        musicLufs: -20,
        duckingDb: 8,
      },
      visualElements: [],
      ctaTemplates: [],
      hashtags: { reels: [], tiktok: [], shorts: [] },
      captionTemplates: {},
      language: 'es',
      parsedAt: new Date().toISOString(),
    };

    const brand = {
      projectId: 'proj-1',
      brandName: 'TestBrand',
      oneLiner: 'We test things',
      audience: { who: 'devs', where: 'twitter', pains: ['complexity'] },
      valueProps: ['speed'],
      features: ['fast'],
      caseStudies: [],
      voiceTone: 'direct',
      ctas: [],
      doNotSay: [],
      parsedAt: new Date().toISOString(),
    };

    const result = await suggestWithAntiRepeat({
      patterns,
      brand,
      projectId: 'proj-1',
      policy: { ...DEFAULT_POLICY, maxAttempts: 3, fallback: 'force' },
    });

    // Must NOT return { ok: false }
    expect('ok' in result && result.ok === false).toBe(false);

    // Must have SuggestOutput shape
    const output = result as { hook: unknown; topic: unknown; signature: unknown };
    expect(output.hook).toBeDefined();
    expect(output.topic).toBeDefined();
    expect(output.signature).toBeDefined();
  });
});
