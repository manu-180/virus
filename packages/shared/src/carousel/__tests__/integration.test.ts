/**
 * Carousel integration test — pure function pipeline simulation.
 *
 * Chains brief → prompts → composeSlide without touching the DB or any
 * external AI API. All AI calls are represented by mock inputs/outputs that
 * mimic the shape Claude/Gemini would return. Sharp + Satori run for real.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildSlidePlanPrompt, buildVisualPrompt, buildCaptionPrompt, buildCaptionSystemPrompt } from '../prompts.js';
import { composeSlide } from '../composer.js';
import { inferLastOkStep } from '../state.js';
import { estimateCarouselCost } from '../cost.js';
import { STYLE_PRESETS } from '../templates.js';
import type { CarouselBrief, SlideSpec } from '../types.js';
import type { ProjectBrand } from '../../viral/types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockBrief: CarouselBrief = {
  topic: 'Cómo crear contenido que vende',
  angle: 'educational',
  tone: 'direct',
  audience: 'Founders de startups',
  slideCount: 3,
  stylePreset: 'minimal',
  language: 'es',
  cta: 'Seguinos para más',
};

const mockBrand: ProjectBrand = {
  projectId: 'test-project-id',
  brandName: 'APEX',
  oneLiner: 'Páginas web que convierten',
  audience: {
    who: 'Founders y solopreneurs',
    where: 'Argentina',
    pains: ['Tráfico sin conversiones', 'Sitio web desactualizado'],
  },
  valueProps: ['Diseño que convierte', 'Entrega en 7 días'],
  features: ['Landing pages', 'E-commerce', 'SEO'],
  caseStudies: [{ title: 'Cliente SaaS', metric: '+40% conversiones' }],
  voiceTone: 'Directo, sin B.S.',
  ctas: [{ kind: 'cta', value: 'Agendá una llamada' }],
  doNotSay: ['click aquí', 'suscribite'],
  parsedAt: '2026-01-01T00:00:00Z',
};

// Simulates Claude's output for a 3-slide plan
const mockSlides: SlideSpec[] = [
  {
    idx: 0,
    role: 'hook',
    headline: 'El 90% del contenido no vende',
    visualPrompt: 'abstract marketing funnel on clean background',
  },
  {
    idx: 1,
    role: 'insight',
    headline: 'Falta estructura, no creatividad',
    body: 'Sin un framework claro, tu contenido solo entretiene.',
    visualPrompt: 'organized geometric shapes on white background',
  },
  {
    idx: 2,
    role: 'cta',
    headline: 'Seguinos para el framework',
    visualPrompt: 'minimalist call to action with arrow',
  },
];

async function makeFakeBaseImage(): Promise<Buffer> {
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 1. Prompt builders — verify structure and content
// ---------------------------------------------------------------------------

describe('buildSlidePlanPrompt', () => {
  const prompt = buildSlidePlanPrompt(mockBrief, mockBrand);

  it('contiene el tema del brief', () => {
    expect(prompt).toContain(mockBrief.topic);
  });

  it('contiene el nombre de la marca', () => {
    expect(prompt).toContain(mockBrand.brandName);
  });

  it('especifica el número de slides', () => {
    expect(prompt).toContain(String(mockBrief.slideCount));
  });

  it('incluye palabras prohibidas cuando doNotSay está definido', () => {
    expect(prompt).toContain('click aquí');
    expect(prompt).toContain('suscribite');
  });

  it('no incluye sección doNotSay cuando el array está vacío', () => {
    const brandWithoutRestrictions: ProjectBrand = { ...mockBrand, doNotSay: [] };
    const cleanPrompt = buildSlidePlanPrompt(mockBrief, brandWithoutRestrictions);
    expect(cleanPrompt).not.toContain('Never use');
  });

  it('incluye el ángulo y el tono', () => {
    expect(prompt).toContain(mockBrief.angle);
    expect(prompt).toContain(mockBrief.tone);
  });
});

describe('buildVisualPrompt', () => {
  it('incluye el visualPrompt del slide como parte de la descripción', () => {
    const prompt = buildVisualPrompt(mockSlides[0]!, 'minimal', mockBrand);
    expect(prompt).toContain(mockSlides[0]!.visualPrompt);
  });

  it('cada preset genera un mood distinto', () => {
    const presets = ['minimal', 'bold', 'editorial'] as const;
    const prompts = presets.map((p) => buildVisualPrompt(mockSlides[0]!, p, mockBrand));
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(3);
  });

  it('incluye el topic como scene anchor cuando se pasa', () => {
    const prompt = buildVisualPrompt(mockSlides[0]!, 'minimal', mockBrand, mockBrief.topic);
    expect(prompt).toContain(mockBrief.topic);
  });

  it('no incluye texto, logos ni watermarks (negatives siempre presentes)', () => {
    const prompt = buildVisualPrompt(mockSlides[0]!, 'bold', mockBrand);
    expect(prompt).toContain('no text');
    expect(prompt).toContain('no logos');
    expect(prompt).toContain('no watermarks');
  });

  it('todos los slides del carrusel generan prompts no vacíos', () => {
    for (const slide of mockSlides) {
      const prompt = buildVisualPrompt(slide, mockBrief.stylePreset, mockBrand, mockBrief.topic);
      expect(prompt.length).toBeGreaterThan(50);
    }
  });
});

describe('buildCaptionSystemPrompt + buildCaptionPrompt', () => {
  const system = buildCaptionSystemPrompt(mockBrand);

  it('system prompt incluye reglas de español argentino', () => {
    expect(system).toContain('vos');
  });

  it('system prompt respeta palabras prohibidas', () => {
    expect(system).toContain('click aquí');
  });

  it('cada framework genera un prompt distinto', () => {
    const frameworks = ['hook-pas-cta', 'hook-aida', 'contrarian'] as const;
    const prompts = frameworks.map((fw) =>
      buildCaptionPrompt(mockBrief, mockSlides, mockBrand, fw),
    );
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(3);
  });

  it('el prompt incluye el resumen de slides', () => {
    const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, 'hook-aida');
    // Each slide headline should appear
    for (const slide of mockSlides) {
      expect(prompt).toContain(slide.headline);
    }
  });

  it('framework hook-pas-cta menciona problema del slide de tipo "problem"', () => {
    const slidesWithProblem: SlideSpec[] = [
      ...mockSlides,
      { idx: 3, role: 'problem', headline: 'El sitio no convierte', visualPrompt: 'broken funnel' },
    ];
    const prompt = buildCaptionPrompt(mockBrief, slidesWithProblem, mockBrand, 'hook-pas-cta');
    expect(prompt).toContain('El sitio no convierte');
  });
});

// ---------------------------------------------------------------------------
// 2. Cost estimation
// ---------------------------------------------------------------------------

describe('estimateCarouselCost', () => {
  it('3 slides da costo de imágenes = 3 × $0.039', () => {
    const { images } = estimateCarouselCost(3);
    expect(images).toBeCloseTo(3 * 0.039, 4);
  });

  it('el costo total es mayor que el costo de imágenes', () => {
    const { total, images } = estimateCarouselCost(5);
    expect(total).toBeGreaterThan(images);
  });

  it('más slides → más costo', () => {
    const { total: cost3 } = estimateCarouselCost(3);
    const { total: cost8 } = estimateCarouselCost(8);
    expect(cost8).toBeGreaterThan(cost3);
  });

  it('la estimación de 8 slides está en el rango $0.15–$0.50', () => {
    const { total } = estimateCarouselCost(8);
    expect(total).toBeGreaterThan(0.15);
    expect(total).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// 3. State inference — integration scenario
// ---------------------------------------------------------------------------

describe('inferLastOkStep — escenario de pipeline completo', () => {
  it('ningún slide → none', () => {
    expect(inferLastOkStep({ slides: [], captionCount: 0, status: 'failed' })).toBe('none');
  });

  it('slides sin imágenes → plan', () => {
    const state = {
      slides: [{ status: 'pending', image_path: null, composed_path: null }],
      captionCount: 0,
      status: 'failed' as const,
    };
    expect(inferLastOkStep(state)).toBe('plan');
  });

  it('imágenes sin composición → slides', () => {
    const state = {
      slides: [{ status: 'ready', image_path: 'img/0.png', composed_path: null }],
      captionCount: 0,
      status: 'failed' as const,
    };
    expect(inferLastOkStep(state)).toBe('slides');
  });

  it('composición sin captions → composing', () => {
    const state = {
      slides: [{ status: 'ready', image_path: 'img/0.png', composed_path: 'composed/0.png' }],
      captionCount: 0,
      status: 'failed' as const,
    };
    expect(inferLastOkStep(state)).toBe('composing');
  });

  it('captions presentes → captions (prioridad máxima)', () => {
    const state = {
      slides: [{ status: 'ready', image_path: 'img/0.png', composed_path: 'composed/0.png' }],
      captionCount: 3,
      status: 'failed' as const,
    };
    expect(inferLastOkStep(state)).toBe('captions');
  });
});

// ---------------------------------------------------------------------------
// 4. composeSlide — real Sharp + Satori, no external API
// ---------------------------------------------------------------------------

describe('composeSlide — pipeline end-to-end con imagen sintética', () => {
  it('cada slide del carrusel produce un PNG 1080×1350 válido', async () => {
    const base = await makeFakeBaseImage();

    for (const slide of mockSlides) {
      const result = await composeSlide({
        baseImage: base,
        slide,
        preset: STYLE_PRESETS.minimal,
      });
      const meta = await sharp(result).metadata();
      expect(meta.format, `slide ${slide.idx}: formato`).toBe('png');
      expect(meta.width, `slide ${slide.idx}: ancho`).toBe(1080);
      expect(meta.height, `slide ${slide.idx}: alto`).toBe(1350);
      expect(result.length, `slide ${slide.idx}: buffer no vacío`).toBeGreaterThan(0);
    }
  }, 90_000);

  it('el overlay modifica la imagen base (contenido diferente)', async () => {
    const base = await makeFakeBaseImage();
    const result = await composeSlide({
      baseImage: base,
      slide: mockSlides[0]!,
      preset: STYLE_PRESETS.bold,
    });
    expect(result).not.toEqual(base);
  }, 30_000);

  it('preset bold produce output diferente a minimal para el mismo slide', async () => {
    const base = await makeFakeBaseImage();
    const [minimal, bold] = await Promise.all([
      composeSlide({ baseImage: base, slide: mockSlides[0]!, preset: STYLE_PRESETS.minimal }),
      composeSlide({ baseImage: base, slide: mockSlides[0]!, preset: STYLE_PRESETS.bold }),
    ]);
    expect(minimal).not.toEqual(bold);
  }, 30_000);

  it('slide de CTA (idx=2) compone correctamente', async () => {
    const base = await makeFakeBaseImage();
    const ctaSlide = mockSlides[2]!;
    const result = await composeSlide({ baseImage: base, slide: ctaSlide, preset: STYLE_PRESETS.editorial });
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1080);
  }, 30_000);
});
