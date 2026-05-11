import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock the Gemini provider before importing the modules under test.
// ---------------------------------------------------------------------------
vi.mock('../../visuals/providers/gemini.js', () => ({
  generateImageGemini: vi.fn(),
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
import type { ProjectBrand } from '../../viral/types.js';

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
  const from = vi.fn(() => ({ upload }));
  const storage = { from };
  return { db: { storage } as unknown as SupabaseClient, upload, from };
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
});
