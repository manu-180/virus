import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock the Gemini provider before importing the modules under test.
// ---------------------------------------------------------------------------
vi.mock('../../visuals/providers/gemini.js', () => ({
  generateImageGemini: vi.fn(),
}));

// Embeddings are mocked: image-library code calls embedText() for reuse
// lookups and library saves. The carousel pipeline must work fully offline.
vi.mock('../../visuals/providers/gemini-embedding.js', () => ({
  embedText: vi.fn(async () => Array.from({ length: 768 }, () => 0.01)),
  EMBEDDING_DIMENSIONS: 768,
}));

// p-limit is ESM — mock it so tests run synchronously without actual concurrency.
vi.mock('p-limit', () => ({
  default: (n: number) => {
    void n;
    return (fn: () => unknown) => fn();
  },
}));

import { generateImageGemini } from '../../visuals/providers/gemini.js';
import {
  generateCarouselSlideImage,
  CarouselSafetyBlockedError,
  CarouselRateLimitError,
  RATE_LIMIT_MAX_RETRIES,
  _internal,
} from '../image-provider.js';
import { generateAllSlideImages } from '../image-batch.js';
import type { CarouselBrief, SlideSpec } from '../types.js';
import type { BrandImageProfile, ProjectBrand } from '../../viral/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBrief: CarouselBrief = {
  topic: 'growth hacks',
  angle: 'listicle',
  tone: 'direct',
  audience: 'founders',
  slideCount: 8,
  stylePreset: 'bold',
  language: 'es',
  cta: 'Seguinos para más',
};

const mockSlide: SlideSpec = {
  idx: 3,
  role: 'insight',
  headline: 'El 80% de tu tráfico viene del 20% de tu contenido',
  visualPrompt: 'A bar chart with glowing top bar, dark background, neon green accent',
};

const mockBrand: ProjectBrand = {
  projectId: 'proj-1',
  brandName: 'APEX',
  oneLiner: 'Landing pages que convierten',
  audience: { who: 'founders', where: 'LATAM', pains: ['no tráfico', 'baja conversión'] },
  valueProps: ['rápido', 'efectivo'],
  features: ['diseño', 'seo'],
  caseStudies: [],
  voiceTone: 'directo y sin vueltas',
  ctas: [{ kind: 'link', value: 'theapexweb.com' }],
  doNotSay: [],
  parsedAt: '2026-05-09T00:00:00Z',
};

const fakeImageBuffer = Buffer.from('fake-png-data');

function makeSupabaseMock(uploadError: unknown = null) {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: uploadError });
  const copy = vi.fn().mockResolvedValue({ data: {}, error: null });
  const download = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => fakeImageBuffer },
    error: null,
  });
  const from = vi.fn(() => ({ upload, copy, download }));
  const storage = { from };
  // Table + RPC surface used by the image library. `rpc` returns no matches
  // by default so reuse never short-circuits generation in these tests.
  const insert = vi.fn().mockResolvedValue({ data: {}, error: null });
  const tableFrom = vi.fn(() => ({ insert }));
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  return {
    db: { storage, from: tableFrom, rpc } as unknown as SupabaseClient,
    upload,
    from,
    copy,
    download,
    insert,
    rpc,
  };
}

// ---------------------------------------------------------------------------
// generateCarouselSlideImage
// ---------------------------------------------------------------------------

describe('generateCarouselSlideImage', () => {
  beforeEach(() => {
    vi.mocked(generateImageGemini).mockReset();
    // Stub sleep so retry tests run fast (default impl uses real timers).
    _internal.sleep = vi.fn().mockResolvedValue(undefined);
  });

  it('calls generateImageGemini with aspectRatio 4:5 and uploads to correct path', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const { db, upload, from } = makeSupabaseMock();

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    // Gemini called with correct aspect ratio
    expect(generateImageGemini).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: '4:5' }),
    );

    // Uploaded to the `carousels` bucket
    expect(from).toHaveBeenCalledWith('carousels');

    // Storage path follows {userId}/{carouselId}/slide-{idx}.png
    expect(upload).toHaveBeenCalledWith(
      'user-abc/carousel-xyz/slide-3.png',
      fakeImageBuffer,
      expect.objectContaining({ contentType: 'image/png' }),
    );

    // Returns expected shape
    expect(result.path).toBe('user-abc/carousel-xyz/slide-3.png');
    expect(result.bytes).toBe(fakeImageBuffer.length);
    expect(typeof result.costCents).toBe('number');
    expect(result.costCents).toBeGreaterThan(0);
  });

  it('throws CarouselSafetyBlockedError when Gemini returns gemini_no_image', async () => {
    vi.mocked(generateImageGemini).mockRejectedValue(
      new Error('gemini_no_image: This content violates our policy'),
    );

    const { db } = makeSupabaseMock();

    await expect(
      generateCarouselSlideImage({
        brief: mockBrief,
        slide: mockSlide,
        brand: mockBrand,
        userId: 'user-abc',
        carouselId: 'carousel-xyz',
        supabase: db,
      }),
    ).rejects.toBeInstanceOf(CarouselSafetyBlockedError);
  });

  it('throws CarouselRateLimitError after exhausting retries on 429 / quota errors', async () => {
    vi.mocked(generateImageGemini).mockRejectedValue(new Error('HTTP 429: quota exceeded'));

    const { db } = makeSupabaseMock();

    await expect(
      generateCarouselSlideImage({
        brief: mockBrief,
        slide: mockSlide,
        brand: mockBrand,
        userId: 'user-abc',
        carouselId: 'carousel-xyz',
        supabase: db,
      }),
    ).rejects.toBeInstanceOf(CarouselRateLimitError);

    // Initial attempt + RATE_LIMIT_MAX_RETRIES retries
    expect(generateImageGemini).toHaveBeenCalledTimes(RATE_LIMIT_MAX_RETRIES + 1);
    // Sleep called between retries (one fewer than total attempts)
    expect(_internal.sleep).toHaveBeenCalledTimes(RATE_LIMIT_MAX_RETRIES);
  });

  it('succeeds after a transient rate limit and recovery', async () => {
    vi.mocked(generateImageGemini)
      .mockRejectedValueOnce(new Error('HTTP 429: quota exceeded'))
      .mockRejectedValueOnce(new Error('rate_limit'))
      .mockResolvedValueOnce({
        bytes: fakeImageBuffer,
        width: 1080,
        height: 1350,
        costUsd: 0.04,
      });

    const { db } = makeSupabaseMock();

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.path).toBe('user-abc/carousel-xyz/slide-3.png');
    expect(generateImageGemini).toHaveBeenCalledTimes(3); // 2 fails + 1 success
    expect(_internal.sleep).toHaveBeenCalledTimes(2);
  });

  it('treats RESOURCE_EXHAUSTED as a rate limit and retries', async () => {
    vi.mocked(generateImageGemini).mockRejectedValue(
      new Error('Google AI: RESOURCE_EXHAUSTED — please slow down'),
    );

    const { db } = makeSupabaseMock();

    await expect(
      generateCarouselSlideImage({
        brief: mockBrief,
        slide: mockSlide,
        brand: mockBrand,
        userId: 'user-abc',
        carouselId: 'carousel-xyz',
        supabase: db,
      }),
    ).rejects.toBeInstanceOf(CarouselRateLimitError);

    expect(generateImageGemini).toHaveBeenCalledTimes(RATE_LIMIT_MAX_RETRIES + 1);
  });

  it('re-throws unknown errors as-is', async () => {
    const boom = new Error('network timeout');
    vi.mocked(generateImageGemini).mockRejectedValue(boom);

    const { db } = makeSupabaseMock();

    await expect(
      generateCarouselSlideImage({
        brief: mockBrief,
        slide: mockSlide,
        brand: mockBrand,
        userId: 'user-abc',
        carouselId: 'carousel-xyz',
        supabase: db,
      }),
    ).rejects.toBe(boom);
  });

  it('throws when Supabase upload returns an error', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const { db } = makeSupabaseMock({ message: 'bucket not found' });

    await expect(
      generateCarouselSlideImage({
        brief: mockBrief,
        slide: mockSlide,
        brand: mockBrand,
        userId: 'user-abc',
        carouselId: 'carousel-xyz',
        supabase: db,
      }),
    ).rejects.toMatchObject({ message: 'bucket not found' });
  });

  // --- Reference image / image-to-image propagation ---

  it('propagates the referenceImage to generateImageGemini when provided', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const { db } = makeSupabaseMock();
    const referenceImage = Buffer.from('anchor-png-bytes');

    await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      referenceImage,
    });

    expect(generateImageGemini).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImage }),
    );
    // The prompt sent to Gemini should include the reference directive
    const callArgs = vi.mocked(generateImageGemini).mock.calls[0]?.[0];
    expect(callArgs?.prompt).toContain('Use the attached image as the canonical visual reference');
  });

  it('does NOT include the reference directive when no referenceImage is passed', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const { db } = makeSupabaseMock();

    await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    const callArgs = vi.mocked(generateImageGemini).mock.calls[0]?.[0];
    expect(callArgs?.prompt ?? '').not.toContain('Use the attached image as the canonical visual reference');
    expect(callArgs?.referenceImage).toBeUndefined();
  });

  it('returns the buffer alongside path/bytes/costCents', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const { db } = makeSupabaseMock();

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.buffer).toEqual(fakeImageBuffer);
  });
});

// ---------------------------------------------------------------------------
// generateAllSlideImages — batch
// ---------------------------------------------------------------------------

describe('generateAllSlideImages', () => {
  beforeEach(() => {
    vi.mocked(generateImageGemini).mockReset();
    _internal.sleep = vi.fn().mockResolvedValue(undefined);
  });

  function makeSlides(count: number): SlideSpec[] {
    const roles = ['hook', 'problem', 'insight', 'data', 'example', 'cta'] as const;
    type Role = (typeof roles)[number];
    return Array.from({ length: count }, (_, i) => ({
      idx: i,
      role: (roles[i % roles.length] as Role),
      headline: `Slide ${i} headline`,
      visualPrompt: `Slide ${i} visual`,
    }));
  }

  it('returns all 8 slides as succeeded when all pass', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(8);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(8);
    expect(result.failed).toHaveLength(0);
  });

  it('with 8 slides and 1 failing, returns succeeded=7 and failed=1', async () => {
    vi.mocked(generateImageGemini).mockImplementation(async ({ prompt }: { prompt: string }) => {
      // Slide at idx=4 will fail (its prompt is embedded via buildVisualPrompt)
      if (prompt.includes('Slide 4 visual')) {
        throw new Error('gemini_no_image: policy violation');
      }
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(8);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(7);
    expect(result.failed).toHaveLength(1);
    const failedSlide = result.failed[0];
    expect(failedSlide?.idx).toBe(4);
    expect(failedSlide?.error).toBeInstanceOf(CarouselSafetyBlockedError);
  });

  it('calls onSlideDone for each succeeded slide', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(3);
    const { db } = makeSupabaseMock();
    const onSlideDone = vi.fn().mockResolvedValue(undefined);

    await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      onSlideDone,
    });

    expect(onSlideDone).toHaveBeenCalledTimes(3);
  });

  // --- Anchor-first chaining ---

  it('generates the hook slide first and passes its buffer as referenceImage to the rest', async () => {
    const anchorBytes = Buffer.from('ANCHOR-BYTES');
    const otherBytes = Buffer.from('OTHER-BYTES');

    let callIdx = 0;
    vi.mocked(generateImageGemini).mockImplementation(async (input) => {
      callIdx++;
      // First call: anchor (no reference image).
      if (callIdx === 1) {
        expect(input.referenceImage).toBeUndefined();
        return { bytes: anchorBytes, width: 1080, height: 1350, costUsd: 0.04 };
      }
      // Subsequent calls: must receive the anchor buffer as reference.
      expect(input.referenceImage).toEqual(anchorBytes);
      return { bytes: otherBytes, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(5);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(5);
    expect(result.failed).toHaveLength(0);
    expect(generateImageGemini).toHaveBeenCalledTimes(5);
  });

  it('strips the internal buffer from succeeded results before returning', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(3);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    for (const s of result.succeeded) {
      // `buffer` is intentionally not in the public SlideSuccess type — assert
      // at runtime that it doesn't leak through.
      expect((s as unknown as { buffer?: Buffer }).buffer).toBeUndefined();
    }
  });

  it('strips the buffer from onSlideDone callbacks too', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(3);
    const { db } = makeSupabaseMock();
    const onSlideDone = vi.fn().mockResolvedValue(undefined);

    await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      onSlideDone,
    });

    for (const call of onSlideDone.mock.calls) {
      const success = call[1] as { buffer?: Buffer };
      expect(success.buffer).toBeUndefined();
    }
  });

  it('degrades gracefully when the anchor fails: rest still generates without referenceImage', async () => {
    let callIdx = 0;
    vi.mocked(generateImageGemini).mockImplementation(async (input) => {
      callIdx++;
      // First call (anchor) fails.
      if (callIdx === 1) {
        throw new Error('gemini_no_image: policy violation on hook');
      }
      // All subsequent calls must NOT receive a referenceImage.
      expect(input.referenceImage).toBeUndefined();
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(4);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    // Anchor failed, the other 3 succeeded.
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.idx).toBe(0);
    expect(result.succeeded).toHaveLength(3);
  });

  it('treats role=hook as anchor even if not at idx 0', async () => {
    // Build slides where idx 0 is "problem" and idx 2 is "hook" — pickAnchor
    // should still grab idx 2 as the anchor.
    const slides: SlideSpec[] = [
      { idx: 0, role: 'problem', headline: 'P', visualPrompt: 'p-visual' },
      { idx: 1, role: 'insight', headline: 'I', visualPrompt: 'i-visual' },
      { idx: 2, role: 'hook', headline: 'H', visualPrompt: 'h-visual' },
      { idx: 3, role: 'cta', headline: 'C', visualPrompt: 'c-visual' },
    ];

    let callIdx = 0;
    vi.mocked(generateImageGemini).mockImplementation(async (input) => {
      callIdx++;
      if (callIdx === 1) {
        // Anchor must be the hook (h-visual)
        expect(input.prompt).toContain('h-visual');
        expect(input.referenceImage).toBeUndefined();
        return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
      }
      // Rest must receive a reference image
      expect(input.referenceImage).toBeDefined();
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(4);
  });

  it('handles an empty slides array without throwing', async () => {
    const { db } = makeSupabaseMock();
    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides: [],
      brand: mockBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(generateImageGemini).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // world-anchor strategy — APEX-style, no chaining, every slide independent
  // -------------------------------------------------------------------------

  const worldAnchorProfile: BrandImageProfile = {
    mode: 'illustration-3d',
    technique: 'premium 3D render',
    subjectStrategy: 'world-anchor',
    composition: 'single hero subject, lots of negative space',
    moodKeywords: ['cinematic', 'premium'],
    negativeVisuals: ['humans', 'text'],
    subjectLibrary: {
      hook: ['monolith with cyan fissures'],
    },
  };

  const apexBrand: ProjectBrand = {
    ...mockBrand,
    visualStyle: {
      accentColor: '#6366F1',
      secondaryAccent: '#00D4FF',
      backgroundColor: '#050B18',
      vibe: 'tech-premium dark mode',
      imageProfile: worldAnchorProfile,
    },
  };

  it('world-anchor: never passes a referenceImage to any slide', async () => {
    vi.mocked(generateImageGemini).mockImplementation(async (input) => {
      // Every single call must come WITHOUT a reference image
      expect(input.referenceImage).toBeUndefined();
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(6);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(6);
    expect(result.failed).toHaveLength(0);
    expect(generateImageGemini).toHaveBeenCalledTimes(6);
  });

  it('world-anchor: per-slide failures do NOT cascade to others', async () => {
    vi.mocked(generateImageGemini).mockImplementation(async ({ prompt }) => {
      if (prompt.includes('Slide 2 visual')) {
        throw new Error('gemini_no_image: policy violation');
      }
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(5);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.succeeded).toHaveLength(4);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.idx).toBe(2);
  });

  it('world-anchor: hook failure does NOT prevent the rest from generating', async () => {
    vi.mocked(generateImageGemini).mockImplementation(async ({ prompt }) => {
      if (prompt.includes('Slide 0 visual')) {
        throw new Error('gemini_no_image: policy violation on hook');
      }
      return { bytes: fakeImageBuffer, width: 1080, height: 1350, costUsd: 0.04 };
    });

    const slides = makeSlides(4);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.idx).toBe(0);
    expect(result.succeeded).toHaveLength(3);
  });

  it('world-anchor: strips buffers from succeeded results', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(3);
    const { db } = makeSupabaseMock();

    const result = await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    for (const s of result.succeeded) {
      expect((s as unknown as { buffer?: Buffer }).buffer).toBeUndefined();
    }
  });

  it('world-anchor: calls onSlideDone for each succeeded slide without leaking the buffer', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(4);
    const { db } = makeSupabaseMock();
    const onSlideDone = vi.fn().mockResolvedValue(undefined);

    await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      onSlideDone,
    });

    expect(onSlideDone).toHaveBeenCalledTimes(4);
    for (const call of onSlideDone.mock.calls) {
      const success = call[1] as { buffer?: Buffer };
      expect(success.buffer).toBeUndefined();
    }
  });

  it('world-anchor: each slide prompt includes the imageProfile technique', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });

    const slides = makeSlides(3);
    const { db } = makeSupabaseMock();

    await generateAllSlideImages({
      brief: mockBrief,
      slides,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
    });

    for (const call of vi.mocked(generateImageGemini).mock.calls) {
      const input = call[0];
      expect(input.prompt).toContain('premium 3D render');
      expect(input.prompt).toMatch(/Negative:.*no humans/);
    }
  });

  // -------------------------------------------------------------------------
  // Image library reuse — world-anchor brands consult the library first
  // -------------------------------------------------------------------------

  it('reuse: serves a matching library image instead of calling Gemini', async () => {
    const { db, rpc, download } = makeSupabaseMock();
    // Library returns a strong match for this slide.
    vi.mocked(rpc).mockResolvedValueOnce({
      data: [
        {
          id: 'asset-1',
          storage_path: 'library/proj-1/insight/asset-1.png',
          similarity: 0.95,
        },
      ],
      error: null,
    });

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      allowReuse: true,
    });

    // Gemini was NOT called — the image came from the library.
    expect(generateImageGemini).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith('library/proj-1/insight/asset-1.png');
    expect(result.reused).toBe(true);
    expect(result.assetId).toBe('asset-1');
    expect(result.costCents).toBe(0);
    expect(result.path).toBe('user-abc/carousel-xyz/slide-3.png');
  });

  it('reuse: generates fresh when the library has no match', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });
    const { db } = makeSupabaseMock(); // rpc returns [] by default

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      allowReuse: true,
    });

    expect(generateImageGemini).toHaveBeenCalledTimes(1);
    expect(result.reused).toBe(false);
    expect(result.costCents).toBeGreaterThan(0);
  });

  it('reuse: never consulted when allowReuse is not set (anchor-chain path)', async () => {
    vi.mocked(generateImageGemini).mockResolvedValue({
      bytes: fakeImageBuffer,
      width: 1080,
      height: 1350,
      costUsd: 0.04,
    });
    const { db, rpc } = makeSupabaseMock();

    const result = await generateCarouselSlideImage({
      brief: mockBrief,
      slide: mockSlide,
      brand: apexBrand,
      userId: 'user-abc',
      carouselId: 'carousel-xyz',
      supabase: db,
      // allowReuse omitted
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(result.reused).toBe(false);
  });
});
