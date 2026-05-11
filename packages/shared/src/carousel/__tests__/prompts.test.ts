import { describe, it, expect } from 'vitest';
import { buildCaptionPrompt, buildCaptionSystemPrompt, buildVisualPrompt } from '../prompts.js';
import type { CarouselBrief, SlideSpec } from '../types.js';
import type { ProjectBrand } from '../../viral/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBrand: ProjectBrand = {
  projectId: 'test-project',
  brandName: 'APEX',
  oneLiner: 'Páginas web que convierten',
  voiceTone: 'directo y sin vueltas',
  ctas: [],
  doNotSay: ['barato', 'económico'],
  audience: { who: 'dueños de negocios', where: 'Argentina', pains: ['no consigo clientes'] },
  valueProps: [],
  features: [],
  caseStudies: [],
  parsedAt: new Date().toISOString(),
};

const mockBrief: CarouselBrief = {
  topic: 'Por qué tu sitio web no vende',
  angle: 'contrarian',
  tone: 'direct',
  audience: 'dueños de negocios',
  slideCount: 8,
  stylePreset: 'bold',
  language: 'es',
  cta: 'Guardalo para cuando lo necesites',
};

const mockSlides: SlideSpec[] = [
  {
    idx: 0,
    role: 'hook',
    headline: '¿Tu web tiene visitas pero no vende?',
    visualPrompt: 'hook visual',
  },
  {
    idx: 1,
    role: 'problem',
    headline: 'El problema no es el tráfico',
    visualPrompt: 'problem visual',
  },
  {
    idx: 2,
    role: 'insight',
    headline: '3 errores que bloquean la conversión',
    visualPrompt: 'insight visual',
  },
];

const slidesWithoutProblem: SlideSpec[] = [
  { idx: 0, role: 'hook', headline: 'Hook aquí', visualPrompt: 'v' },
  { idx: 1, role: 'insight', headline: 'Insight aquí', visualPrompt: 'v' },
];

// ---------------------------------------------------------------------------
// buildCaptionPrompt
// ---------------------------------------------------------------------------

describe('buildCaptionPrompt', () => {
  it('hook-pas-cta includes the problem slide headline explicitly', () => {
    const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, 'hook-pas-cta');
    expect(prompt).toContain('El problema no es el tráfico');
  });

  it('hook-pas-cta without a problem slide still renders without placeholder', () => {
    const prompt = buildCaptionPrompt(mockBrief, slidesWithoutProblem, mockBrand, 'hook-pas-cta');
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
    // problem slide section should still be present but without a quoted headline
    expect(prompt).toContain('Problema');
  });

  it('does not contain unfilled template placeholders for any framework', () => {
    for (const framework of ['hook-pas-cta', 'hook-aida', 'contrarian'] as const) {
      const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, framework);
      expect(prompt, `${framework}: no {topic}`).not.toMatch(/\{topic\}/);
      expect(prompt, `${framework}: no {cta}`).not.toMatch(/\{cta\}/);
      expect(prompt, `${framework}: no {framework}`).not.toMatch(/\{framework\}/);
    }
  });

  it('includes the carousel CTA in all frameworks', () => {
    for (const framework of ['hook-pas-cta', 'hook-aida', 'contrarian'] as const) {
      const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, framework);
      expect(prompt, `${framework}: CTA present`).toContain(mockBrief.cta);
    }
  });

  it('includes the topic in the user message', () => {
    const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, 'hook-aida');
    expect(prompt).toContain(mockBrief.topic);
  });

  it('lists all slides in the summary', () => {
    const prompt = buildCaptionPrompt(mockBrief, mockSlides, mockBrand, 'contrarian');
    for (const slide of mockSlides) {
      expect(prompt).toContain(slide.headline);
    }
  });
});

// ---------------------------------------------------------------------------
// buildCaptionSystemPrompt
// ---------------------------------------------------------------------------

describe('buildCaptionSystemPrompt', () => {
  it('do_not_say words appear inside the EVITAR section', () => {
    const prompt = buildCaptionSystemPrompt(mockBrand);
    expect(prompt).toContain('EVITAR');
    expect(prompt).toContain('"barato"');
    expect(prompt).toContain('"económico"');
  });

  it('instructs to use "vos" not "tú"', () => {
    const prompt = buildCaptionSystemPrompt(mockBrand);
    expect(prompt.toLowerCase()).toContain('vos');
    expect(prompt.toLowerCase()).toContain('"tú"');
  });

  it('omits EVITAR section when doNotSay is empty', () => {
    const brandNoRestrictions: ProjectBrand = { ...mockBrand, doNotSay: [] };
    const prompt = buildCaptionSystemPrompt(brandNoRestrictions);
    expect(prompt).not.toContain('EVITAR');
  });

  it('specifies 120-280 character range', () => {
    const prompt = buildCaptionSystemPrompt(mockBrand);
    expect(prompt).toContain('120');
    expect(prompt).toContain('280');
  });

  it('prohibits markdown', () => {
    const prompt = buildCaptionSystemPrompt(mockBrand);
    expect(prompt.toLowerCase()).toContain('markdown');
  });
});

// ---------------------------------------------------------------------------
// buildVisualPrompt
// ---------------------------------------------------------------------------

describe('buildVisualPrompt', () => {
  const slide = mockSlides[0]!;

  it('falls back to brandName-only when visualStyle is undefined', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand);
    expect(prompt).toContain('APEX');
    expect(prompt).not.toContain('Brand palette');
  });

  it('threads accentColor into the prompt when provided', () => {
    const brandWithStyle: ProjectBrand = {
      ...mockBrand,
      visualStyle: { accentColor: '#06b6d4' },
    };
    const prompt = buildVisualPrompt(slide, 'bold', brandWithStyle);
    expect(prompt).toContain('Brand palette');
    expect(prompt).toContain('#06b6d4');
  });

  it('threads vibe and secondary accent and background', () => {
    const brandWithStyle: ProjectBrand = {
      ...mockBrand,
      visualStyle: {
        accentColor: '#06b6d4',
        secondaryAccent: '#7c3aed',
        backgroundColor: '#050508',
        vibe: 'tech-premium dark mode',
      },
    };
    const prompt = buildVisualPrompt(slide, 'bold', brandWithStyle);
    expect(prompt).toContain('#06b6d4');
    expect(prompt).toContain('#7c3aed');
    expect(prompt).toContain('#050508');
    expect(prompt).toContain('tech-premium dark mode');
  });

  it('always includes aspect ratio 4:5', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand);
    expect(prompt).toContain('4:5');
    expect(prompt).toContain('1080x1350');
  });

  it('includes preset-specific mood for bold', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand);
    expect(prompt).toContain('high contrast');
  });
});

