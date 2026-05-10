import { describe, it, expect } from 'vitest';
import { inferLastOkStep } from '../state.js';
import type { CarouselStateSnapshot } from '../state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slide(opts: { image_path?: string | null; composed_path?: string | null; status?: string } = {}) {
  return {
    status: opts.status ?? 'ready',
    image_path: opts.image_path ?? null,
    composed_path: opts.composed_path ?? null,
  };
}

function snap(overrides: Partial<CarouselStateSnapshot> = {}): CarouselStateSnapshot {
  return {
    slides: [],
    captionCount: 0,
    status: 'failed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inferLastOkStep', () => {
  describe('none — no progress at all', () => {
    it('returns none when slides is empty and status is failed', () => {
      expect(inferLastOkStep(snap({ slides: [], captionCount: 0, status: 'failed' }))).toBe('none');
    });

    it('returns none when slides is empty and status is pending', () => {
      expect(inferLastOkStep(snap({ slides: [], status: 'pending' }))).toBe('none');
    });
  });

  describe('plan — slides persisted but no images yet', () => {
    it('returns plan when slides exist but no image_path anywhere', () => {
      const state = snap({
        slides: [
          slide({ image_path: null, composed_path: null, status: 'pending' }),
          slide({ image_path: null, composed_path: null, status: 'pending' }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('plan');
    });

    it('returns plan when status is generating_slides even with no slide rows', () => {
      expect(inferLastOkStep(snap({ slides: [], status: 'generating_slides' }))).toBe('plan');
    });

    it('returns plan when all slides are failed with no image_path', () => {
      const state = snap({
        slides: [
          slide({ status: 'failed', image_path: null }),
          slide({ status: 'failed', image_path: null }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('plan');
    });
  });

  describe('slides — at least one image generated', () => {
    it('returns slides when at least one slide has image_path', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'carousel/img/0.png', composed_path: null }),
          slide({ image_path: null, composed_path: null, status: 'failed' }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('slides');
    });

    it('returns slides when all slides have image_path but none are composed', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'carousel/img/0.png', composed_path: null }),
          slide({ image_path: 'carousel/img/1.png', composed_path: null }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('slides');
    });

    it('returns slides when status is composing with no composed slides', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'carousel/img/0.png', composed_path: null }),
        ],
        status: 'composing',
      });
      expect(inferLastOkStep(state)).toBe('slides');
    });
  });

  describe('composing — at least one slide composed', () => {
    it('returns composing when at least one slide has composed_path', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'carousel/img/0.png', composed_path: 'carousel/composed/0.png' }),
          slide({ image_path: 'carousel/img/1.png', composed_path: null, status: 'failed' }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('composing');
    });

    it('returns composing when all slides are fully composed', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'carousel/img/0.png', composed_path: 'carousel/composed/0.png' }),
          slide({ image_path: 'carousel/img/1.png', composed_path: 'carousel/composed/1.png' }),
        ],
      });
      expect(inferLastOkStep(state)).toBe('composing');
    });

    it('returns composing when status is generating_captions', () => {
      const state = snap({
        slides: [slide({ image_path: 'img/0.png', composed_path: null })],
        status: 'generating_captions',
      });
      expect(inferLastOkStep(state)).toBe('composing');
    });
  });

  describe('captions — caption generation completed', () => {
    it('returns captions when captionCount > 0', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'img/0.png', composed_path: 'composed/0.png' }),
        ],
        captionCount: 3,
      });
      expect(inferLastOkStep(state)).toBe('captions');
    });

    it('returns captions even when status is failed', () => {
      expect(inferLastOkStep(snap({ captionCount: 1, status: 'failed' }))).toBe('captions');
    });

    it('captionCount takes priority over everything else', () => {
      const state = snap({
        slides: [],
        captionCount: 2,
        status: 'failed',
      });
      expect(inferLastOkStep(state)).toBe('captions');
    });
  });

  describe('priority ordering', () => {
    it('captions > composing (composed slides + captions)', () => {
      const state = snap({
        slides: [slide({ composed_path: 'composed/0.png' })],
        captionCount: 3,
      });
      expect(inferLastOkStep(state)).toBe('captions');
    });

    it('composing > slides (composed slides present)', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'img/0.png', composed_path: 'composed/0.png' }),
        ],
        captionCount: 0,
      });
      expect(inferLastOkStep(state)).toBe('composing');
    });

    it('slides > plan (image present but not composed)', () => {
      const state = snap({
        slides: [
          slide({ image_path: 'img/0.png', composed_path: null }),
        ],
        captionCount: 0,
      });
      expect(inferLastOkStep(state)).toBe('slides');
    });

    it('plan > none (slide rows but no image)', () => {
      const state = snap({
        slides: [slide({ image_path: null, composed_path: null })],
        captionCount: 0,
      });
      expect(inferLastOkStep(state)).toBe('plan');
    });
  });
});
