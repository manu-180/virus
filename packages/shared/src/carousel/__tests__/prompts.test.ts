import { describe, it, expect } from 'vitest';
import { buildCaptionPrompt, buildCaptionSystemPrompt } from '../prompts.js';
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
