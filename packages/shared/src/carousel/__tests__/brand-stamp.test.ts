import { describe, it, expect } from 'vitest';
import {
  pickBrandStampIdx,
  pickBrandStampIdxFromCount,
} from '../composer.js';
import { buildVisualPrompt } from '../prompts.js';
import type { SlideSpec } from '../types.js';
import type { ProjectBrand } from '../../viral/types.js';

// Brand stamp moved from Satori-overlay to Gemini-prompt: we no longer
// composite a "watermark" on top of a clean photo. Instead, the chosen slide's
// generation prompt asks Gemini to bake the brand name into the artwork as
// display typography. These tests cover both pieces:
//
//  1. The deterministic idx pickers still work (they now feed the image-
//     generation step instead of the composer).
//  2. buildVisualPrompt honors the `brandTypography` option correctly:
//     drops the "no text" negative and injects an integration directive.

describe('brand stamp — idx selection', () => {
  it('pickBrandStampIdxFromCount is deterministic per carouselId', () => {
    const a = pickBrandStampIdxFromCount(8, 'carousel-abc-123');
    const b = pickBrandStampIdxFromCount(8, 'carousel-abc-123');
    const c = pickBrandStampIdxFromCount(8, 'carousel-xyz-999');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThanOrEqual(1);
    expect(a!).toBeLessThanOrEqual(6); // slideCount - 2
    // Different carouselIds may collide but typically differ
    expect(typeof c).toBe('number');
  });

  it('pickBrandStampIdxFromCount returns null when there is no interior slide', () => {
    expect(pickBrandStampIdxFromCount(2, 'whatever')).toBeNull();
    expect(pickBrandStampIdxFromCount(1, 'whatever')).toBeNull();
    expect(pickBrandStampIdxFromCount(0, 'whatever')).toBeNull();
  });

  it('pickBrandStampIdx role-aware skips hook/cta/data and picks an eligible slide', () => {
    const idx = pickBrandStampIdx(
      [
        { idx: 0, role: 'hook' },
        { idx: 1, role: 'problem' },
        { idx: 2, role: 'data' },
        { idx: 3, role: 'insight' },
        { idx: 4, role: 'example' },
        { idx: 5, role: 'cta' },
      ],
      'carousel-abc-123',
    );
    expect([1, 3, 4]).toContain(idx);
  });
});

describe('brand stamp — buildVisualPrompt brandTypography integration', () => {
  // Minimal brand without imageProfile so we hit the legacy path. Both paths
  // honor brandTypography; we test the legacy one because it's the simpler
  // surface and exercises the same negative-line + directive swap.
  const baseBrand: ProjectBrand = {
    projectId: 'proj-1',
    brandName: 'APEX',
    oneLiner: 'we ship things',
    voiceTone: 'direct',
    ctas: [],
    doNotSay: [],
    audience: { who: '', where: '', pains: [] },
    valueProps: [],
    features: [],
    caseStudies: [],
    parsedAt: '2026-05-21T00:00:00.000Z',
  };

  const slide: SlideSpec = {
    idx: 2,
    role: 'insight',
    headline: 'Test',
    visualPrompt: 'a minimal sculpture in soft light',
  };

  it('without brandTypography: forbids text and does not mention the brand integration', () => {
    const prompt = buildVisualPrompt(slide, 'minimal', baseBrand, {});
    expect(prompt).toContain('no text');
    expect(prompt).toContain('no letters');
    expect(prompt).not.toContain('Integrate the word');
  });

  it('with brandTypography: injects integration directive and removes the generic text ban', () => {
    const prompt = buildVisualPrompt(slide, 'minimal', baseBrand, {
      brandTypography: { brandName: 'APEX' },
    });
    // Integration directive present and spells the name verbatim.
    expect(prompt).toContain('Integrate the word "APEX"');
    expect(prompt).toContain('NOT a watermark');
    expect(prompt).toContain('NOT a logo stamp');
    // Generic "no text/letters/words" ban must NOT be there — that's the whole
    // point of the switch, otherwise Gemini will refuse to render the brand.
    expect(prompt).not.toContain('no text,');
    expect(prompt).not.toContain('no letters');
    expect(prompt).not.toContain('no words');
    // We still want to ban WATERMARKS and stray text, just not all lettering.
    expect(prompt).toContain('no extra text beyond the brand name');
    expect(prompt).toContain('no watermarks');
  });

  it('with empty brandTypography.brandName: behaves as if no brandTypography', () => {
    const prompt = buildVisualPrompt(slide, 'minimal', baseBrand, {
      brandTypography: { brandName: '   ' },
    });
    expect(prompt).not.toContain('Integrate the word');
    expect(prompt).toContain('no text');
  });
});
