import { describe, it, expect } from 'vitest';
import { SlideSpecSchema, SlideSpecArraySchema } from '../types.js';

// SlideSpec validation — guards against the silent text-less-slide class of bug
// where an LLM returns an empty headline, validation accepts it, and the
// composer renders a PNG with a visible overlay block but no title text.

describe('SlideSpecSchema.headline', () => {
  const base = {
    idx: 0,
    role: 'hook' as const,
    visualPrompt: 'a test visual',
  };

  it('accepts a non-empty headline', () => {
    const r = SlideSpecSchema.safeParse({ ...base, headline: 'Hello' });
    expect(r.success).toBe(true);
  });

  it('rejects an empty headline', () => {
    const r = SlideSpecSchema.safeParse({ ...base, headline: '' });
    expect(r.success).toBe(false);
  });

  it('rejects a missing headline', () => {
    const r = SlideSpecSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it('rejects a headline over 60 chars', () => {
    const r = SlideSpecSchema.safeParse({ ...base, headline: 'A'.repeat(61) });
    expect(r.success).toBe(false);
  });

  it('rejects an array entry with empty headline', () => {
    const r = SlideSpecArraySchema.safeParse([
      { ...base, headline: 'ok' },
      { ...base, idx: 1, headline: '' },
    ]);
    expect(r.success).toBe(false);
  });
});
