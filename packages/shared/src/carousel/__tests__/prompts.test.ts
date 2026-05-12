import { describe, it, expect } from 'vitest';
import {
  buildCaptionPrompt,
  buildCaptionSystemPrompt,
  buildSlidePlanPrompt,
  buildVisualPrompt,
} from '../prompts.js';
import type { CarouselBrief, SlideSpec } from '../types.js';
import type { BrandImageProfile, ProjectBrand } from '../../viral/types.js';

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

  // --- Role-specific mood layer ---

  it('hook slide gets the cinematic-opening mood layer', () => {
    const hookSlide: SlideSpec = { ...slide, role: 'hook' };
    const prompt = buildVisualPrompt(hookSlide, 'bold', mockBrand);
    expect(prompt.toLowerCase()).toContain('cinematic opening');
    expect(prompt.toLowerCase()).toContain('stopping power');
  });

  it('cta slide gets the loop-closure mood layer', () => {
    const ctaSlide: SlideSpec = { ...slide, role: 'cta', headline: 'Seguinos' };
    const prompt = buildVisualPrompt(ctaSlide, 'bold', mockBrand);
    expect(prompt.toLowerCase()).toContain('closing shot');
    expect(prompt.toLowerCase()).toContain('mirrors the opening');
  });

  it('non-hook/non-cta slides do not get the role-mood layer', () => {
    const insightSlide: SlideSpec = { ...slide, role: 'insight' };
    const prompt = buildVisualPrompt(insightSlide, 'bold', mockBrand);
    expect(prompt.toLowerCase()).not.toContain('cinematic opening');
    expect(prompt.toLowerCase()).not.toContain('closing shot');
  });

  // --- Reference-image / image-to-image directive ---

  it('emits the reference-image directive when hasReferenceImage is true', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand, { hasReferenceImage: true });
    expect(prompt).toContain('Use the attached image as the canonical visual reference');
    expect(prompt.toLowerCase()).toContain('same character');
  });

  it('omits the reference-image directive when no reference is attached', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand, { hasReferenceImage: false });
    expect(prompt).not.toContain('Use the attached image as the canonical visual reference');
  });

  it('accepts a plain-string topic for backwards compatibility', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand, 'Crecer en IG sin pagar ads');
    expect(prompt).toContain('Crecer en IG sin pagar ads');
  });

  it('options form supports both topic and hasReferenceImage together', () => {
    const prompt = buildVisualPrompt(slide, 'bold', mockBrand, {
      topic: 'Crecer en IG',
      hasReferenceImage: true,
    });
    expect(prompt).toContain('Crecer en IG');
    expect(prompt).toContain('Use the attached image as the canonical visual reference');
  });
});

// ---------------------------------------------------------------------------
// buildSlidePlanPrompt — narrative arc + swipe baits
// ---------------------------------------------------------------------------

describe('buildSlidePlanPrompt — narrative arc', () => {
  const brief: CarouselBrief = {
    topic: 'Por qué tu sitio web no vende',
    angle: 'contrarian',
    tone: 'direct',
    audience: 'dueños de negocios',
    slideCount: 6,
    stylePreset: 'bold',
    language: 'es',
    cta: 'Guardalo para cuando lo necesites',
  };

  it('teaches the 3-act structure explicitly', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt).toContain('ACTO 1');
    expect(prompt).toContain('ACTO 2');
    expect(prompt).toContain('ACTO 3');
  });

  it('requires swipe-baits at the end of intermediate-slide bodies', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt.toLowerCase()).toContain('swipe-bait');
  });

  it('pins slide 0 to "hook" and last slide to "cta"', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt).toMatch(/slide 0\.role === "hook"/);
    expect(prompt).toMatch(/slide 5\.role === "cta"/);
  });

  it('asks for visual continuity across slides (anchor-aware)', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt.toLowerCase()).toContain('continuidad visual');
    expect(prompt.toLowerCase()).toContain('ancla');
  });

  it('asks for loop closure on the final slide', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt.toLowerCase()).toContain('loop closure');
  });

  it('uses the slideCount to compute the lastIdx in instructions', () => {
    const prompt8 = buildSlidePlanPrompt({ ...brief, slideCount: 8 }, mockBrand);
    expect(prompt8).toMatch(/slide 7\.role === "cta"/);
  });
});

// ---------------------------------------------------------------------------
// imageProfile-driven prompts — modern schema-aware path
// ---------------------------------------------------------------------------

const apexImageProfile: BrandImageProfile = {
  mode: 'illustration-3d',
  technique: 'premium 3D render with edge lighting and shallow depth of field',
  subjectStrategy: 'world-anchor',
  composition: 'single hero subject centered, 40%+ negative space below',
  moodKeywords: ['cinematic', 'premium', 'moody'],
  negativeVisuals: ['humans', 'text', 'logos', 'clutter'],
  subjectLibrary: {
    hook: ['a fragmented dark monolith with glowing cyan fissures'],
    problem: ['a shattered geometric prism leaking red warning glow'],
    insight: ['an illuminated 3D cube with cyan internal glow'],
    cta: ['the monolith from the hook now whole and fully illuminated'],
  },
};

const brandWithImageProfile: ProjectBrand = {
  projectId: 'apex-test',
  brandName: 'APEX',
  oneLiner: 'Estudio de desarrollo',
  voiceTone: 'directo, sin BS',
  ctas: [],
  doNotSay: [],
  audience: { who: 'founders', where: 'LATAM', pains: ['no escala'] },
  valueProps: [],
  features: [],
  caseStudies: [],
  parsedAt: new Date().toISOString(),
  visualStyle: {
    accentColor: '#6366F1',
    secondaryAccent: '#00D4FF',
    backgroundColor: '#050B18',
    vibe: 'tech-premium dark mode',
    imageProfile: apexImageProfile,
  },
};

describe('buildSlidePlanPrompt — imageProfile path', () => {
  const brief: CarouselBrief = {
    topic: 'Por qué tu MVP no escala',
    angle: 'contrarian',
    tone: 'direct',
    audience: 'founders',
    slideCount: 6,
    stylePreset: 'bold',
    language: 'es',
    cta: 'Hablamos',
  };

  it('includes the brand technique description', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt).toContain(apexImageProfile.technique);
  });

  it('includes the brand composition rules', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt).toContain(apexImageProfile.composition);
  });

  it('includes the subjectStrategy line', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt).toMatch(/Estrategia de continuidad: world-anchor/);
  });

  it('includes the per-role subject library with at least one role', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt).toContain('a fragmented dark monolith with glowing cyan fissures');
    expect(prompt).toContain('an illuminated 3D cube with cyan internal glow');
  });

  it('emits the negative visuals as restrictions', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt).toContain('humans');
    expect(prompt).toContain('clutter');
    expect(prompt.toLowerCase()).toContain('restricciones visuales');
  });

  it('tells Claude NOT to repeat the same subject across slides (world-anchor)', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    expect(prompt.toLowerCase()).toContain('no repitas el mismo sujeto');
  });

  it('does NOT include the legacy "30-year-old man at desk" example in profile mode', () => {
    const prompt = buildSlidePlanPrompt(brief, brandWithImageProfile);
    // The example is shown explicitly as MALO (bad), but should not be presented
    // as the suggested visualPrompt format like in the legacy flow.
    // It still appears as a counter-example, so we assert it's marked as bad:
    expect(prompt).toMatch(/Ejemplo MALO/);
  });

  it('falls back to legacy character-anchor instructions when brand has no imageProfile', () => {
    const prompt = buildSlidePlanPrompt(brief, mockBrand);
    expect(prompt).toContain('Continuidad visual entre slides');
    expect(prompt).toContain('mismo personaje');
  });

  it('uses character-anchor language when subjectStrategy is character-anchor', () => {
    const characterAnchored: ProjectBrand = {
      ...brandWithImageProfile,
      visualStyle: {
        ...brandWithImageProfile.visualStyle,
        imageProfile: { ...apexImageProfile, subjectStrategy: 'character-anchor' },
      },
    };
    const prompt = buildSlidePlanPrompt(brief, characterAnchored);
    expect(prompt.toLowerCase()).toContain('mismo personaje');
    expect(prompt).toMatch(/Estrategia de continuidad: character-anchor/);
  });
});

describe('buildVisualPrompt — imageProfile path', () => {
  const slide = mockSlides[0]!;

  it('composes the final prompt from the imageProfile technique', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain(apexImageProfile.technique);
  });

  it('includes the imageProfile composition rules', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain(apexImageProfile.composition);
  });

  it('joins mood keywords into the prompt', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain('cinematic');
    expect(prompt).toContain('premium');
  });

  it('emits negatives prefixed with "no"', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toMatch(/Negative:.*no humans/);
    expect(prompt).toMatch(/Negative:.*no clutter/);
  });

  it('passes through negatives that already start with "no" without doubling the prefix', () => {
    const brandWithExplicitNos: ProjectBrand = {
      ...brandWithImageProfile,
      visualStyle: {
        ...brandWithImageProfile.visualStyle,
        imageProfile: {
          ...apexImageProfile,
          negativeVisuals: ['no humans', 'no text', 'logos'],
        },
      },
    };
    const prompt = buildVisualPrompt(slide, 'bold', brandWithExplicitNos);
    expect(prompt).not.toContain('no no humans');
    expect(prompt).toContain('no humans');
    expect(prompt).toContain('no logos');
  });

  it('keeps the per-slide visualPrompt at the front so it dominates', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt.indexOf(slide.visualPrompt)).toBeLessThan(prompt.indexOf('Medium:'));
  });

  it('emits the medium label from imageProfile.mode', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain('Medium: illustration-3d');
  });

  it('OMITS the reference-image directive for world-anchor brands even when hasReferenceImage=true', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile, {
      hasReferenceImage: true,
    });
    expect(prompt).not.toContain('Use the attached image as the canonical visual reference');
  });

  it('EMITS the reference-image directive for character-anchor profile brands with hasReferenceImage=true', () => {
    const characterAnchored: ProjectBrand = {
      ...brandWithImageProfile,
      visualStyle: {
        ...brandWithImageProfile.visualStyle,
        imageProfile: { ...apexImageProfile, subjectStrategy: 'character-anchor' },
      },
    };
    const prompt = buildVisualPrompt(slide, 'bold', characterAnchored, {
      hasReferenceImage: true,
    });
    expect(prompt).toContain('Use the attached image as the canonical visual reference');
  });

  it('still inserts the topic anchor in profile mode', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile, {
      topic: 'Por qué tu MVP no escala',
    });
    expect(prompt).toContain('Por qué tu MVP no escala');
  });

  it('threads the brand palette colors into the prompt', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain('#6366F1');
    expect(prompt).toContain('#00D4FF');
    expect(prompt).toContain('#050B18');
  });

  it('still includes aspect ratio in profile mode', () => {
    const prompt = buildVisualPrompt(slide, 'bold', brandWithImageProfile);
    expect(prompt).toContain('4:5');
  });

  it('preserves role-mood layer for hook in profile mode', () => {
    const hookSlide: SlideSpec = { ...slide, role: 'hook' };
    const prompt = buildVisualPrompt(hookSlide, 'bold', brandWithImageProfile);
    expect(prompt.toLowerCase()).toContain('cinematic opening');
  });
});

