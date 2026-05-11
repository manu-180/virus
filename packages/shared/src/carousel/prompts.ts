import { z } from 'zod';
import type { ProjectBrand } from '../viral/types.js';
import type { CarouselBrief, CaptionVariant, SlideSpec } from './types.js';

// ---------------------------------------------------------------------------
// Slide plan prompt — Claude returns a JSON array of SlideSpec
// ---------------------------------------------------------------------------

export function buildSlidePlanPrompt(brief: CarouselBrief, brand: ProjectBrand): string {
  const doNotSay =
    brand.doNotSay.length > 0
      ? `Never use: ${brand.doNotSay.map((w) => `"${w}"`).join(', ')}.`
      : '';

  return `Sos un estratega de contenido para Instagram especializado en carruseles de alto engagement.

## Marca
- Nombre: ${brand.brandName}
- Propuesta: ${brand.oneLiner}
- Audiencia: ${brand.audience.who} en ${brand.audience.where}
- Dolores: ${brand.audience.pains.join('; ')}
- Tono de voz: ${brand.voiceTone}
${doNotSay}

## Brief del carrusel
- Tema: ${brief.topic}
- Ángulo: ${brief.angle}
- Tono: ${brief.tone}
- Audiencia específica: ${brief.audience}
- Slides: ${brief.slideCount}
- CTA final: ${brief.cta}

## Frameworks de estructura
Construí la secuencia respetando este flujo: hook → problema → insights/datos → ejemplo → CTA.
Asigná el rol apropiado a cada slide según este vocabulario: hook | problem | insight | data | example | cta.

## Reglas de texto
- headline: máximo 60 caracteres. Debe generar curiosidad sin clickbait — siempre entregá lo prometido.
- body: máximo 140 caracteres. Opcional solo si el rol lo requiere (data, example).
- visualPrompt: en INGLÉS, describe la imagen que acompaña el slide. Paleta y mood cohesivos entre slides.

## Output
Respondé ÚNICAMENTE con un JSON array válido de ${brief.slideCount} objetos con esta forma exacta:
[
  {
    "idx": 0,
    "role": "hook",
    "headline": "...",
    "body": "...",
    "visualPrompt": "..."
  }
]
Sin texto extra, sin markdown, sin explicaciones. Solo el array JSON.`;
}

// ---------------------------------------------------------------------------
// Caption system prompt — Claude role + brand voice + hard rules
// ---------------------------------------------------------------------------

export function buildCaptionSystemPrompt(brand: ProjectBrand): string {
  const doNotSaySection =
    brand.doNotSay.length > 0
      ? `\n## EVITAR\nPalabras y frases PROHIBIDAS — no aparecen en el caption bajo ninguna circunstancia:\n${brand.doNotSay.map((w) => `- "${w}"`).join('\n')}`
      : '';

  return `Sos un copywriter experto en captions de Instagram para marcas argentinas.

## Estilo de voz
- Directo, sin vueltas, sin corporativismo — cada palabra gana su lugar o no va
- Sin bullshit: prometé solo lo que el carrusel entrega
- Contrarian cuando hay razón: cuestioná lo establecido con fundamento
- Siempre "vos", nunca "tú" — español argentino natural y coloquial${doNotSaySection}

## Reglas del caption
- Entre 120 y 280 caracteres (sin contar hashtags)
- Primera línea: hook que para el scroll
- Sin markdown: no uses **, _, listas con guiones ni nada que IG no renderiza
- Máximo 2 emojis, solo si suman valor real — no decorativos
- No clickbait: entregá lo que prometés
- CTA claro al final
- 5 a 10 hashtags relevantes: niche + marca + 1-2 genéricos (ej. #argentina #marketing #emprendedores)
- Hashtags sin el símbolo # en el JSON

## Output
Respondé ÚNICAMENTE con JSON válido en este formato:
{
  "text": "el caption aquí, sin hashtags, sin markdown",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}
Sin texto extra, sin explicaciones, solo el JSON.`;
}

// ---------------------------------------------------------------------------
// Zod schema for validating Claude's JSON caption response
// ---------------------------------------------------------------------------

export const CaptionResponseSchema = z.object({
  text: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1).max(10),
});

export type CaptionResponse = z.infer<typeof CaptionResponseSchema>;

// ---------------------------------------------------------------------------
// Caption user message — context per framework
// ---------------------------------------------------------------------------

export function buildCaptionPrompt(
  brief: CarouselBrief,
  slides: SlideSpec[],
  brand: ProjectBrand,
  framework: CaptionVariant['framework'],
): string {
  const slidesSummary = slides
    .map((s) => `  Slide ${s.idx + 1} [${s.role}]: ${s.headline}`)
    .join('\n');

  const problemSlide = slides.find((s) => s.role === 'problem');

  const frameworkGuide: Record<CaptionVariant['framework'], string> = {
    'hook-pas-cta': [
      'Estructura PAS:',
      `- Problema: nombrá el dolor directamente${problemSlide ? ` ("${problemSlide.headline}")` : ''} — 1-2 oraciones`,
      '- Agitación: consecuencia concreta si no lo resolvés',
      '- Solución: el carrusel lo muestra + CTA al final',
    ].join('\n'),
    'hook-aida': [
      'Estructura AIDA:',
      '- Atención: hook disruptivo que para el scroll',
      '- Interés: dato o pregunta que engancha',
      '- Deseo: beneficio concreto que van a obtener',
      '- Acción: CTA directo',
    ].join('\n'),
    contrarian: [
      'Estructura contrarian:',
      '- Empezá cuestionando una creencia común ("Todos dicen X, pero...")',
      '- Revelá la verdad contraria con confianza',
      '- Mostrá que el carrusel tiene la evidencia',
      '- CTA',
    ].join('\n'),
  };

  return `## Marca
- Nombre: ${brand.brandName}
- Propuesta: ${brand.oneLiner}
- Audiencia: ${brand.audience.who}
- Tono de voz: ${brand.voiceTone}

## Carrusel a captionear
Tema: ${brief.topic}
Ángulo: ${brief.angle}
CTA del carrusel: ${brief.cta}
Slides:
${slidesSummary}

## Framework: ${framework}
${frameworkGuide[framework]}`;
}

// ---------------------------------------------------------------------------
// Visual prompt — final prompt for Gemini Imagen per slide
// ---------------------------------------------------------------------------

/**
 * Build a visual prompt for a single slide.
 *
 * @param topic - The carousel topic (brief.topic) used as a "scene anchor" so
 *   all slides in the same carousel stay visually coherent.  Pass it from the
 *   outer loop so Gemini anchors every image to the same subject matter.
 */
export function buildVisualPrompt(
  slideSpec: SlideSpec,
  stylePreset: CarouselBrief['stylePreset'],
  brand: ProjectBrand,
  topic?: string,
): string {
  const moodByPreset: Record<CarouselBrief['stylePreset'], string> = {
    minimal:
      'soft cream background, subtle texture, high-key lighting, lots of negative space, no text',
    bold:
      'high contrast scene, dramatic lighting, vivid saturated colors, cinematic, no text',
    editorial:
      'magazine editorial photography, muted desaturated tones, film grain, no text',
  };

  const mood = moodByPreset[stylePreset];

  // Scene anchor: tie every slide to the same topic so the carousel reads as
  // one cohesive visual series.  The individual visualPrompt adds per-slide variation.
  const anchor = topic != null && topic.trim().length > 0
    ? `Scene context: ${topic.trim()}. `
    : '';

  // Pull rich visual identity from project_brand.visual_style if present.
  // The prompt-builder threads accentColor / background / vibe through so each
  // brand's carousels stay visually consistent across the whole series.
  const vs = brand.visualStyle ?? {};
  const brandHints: string[] = [];
  if (vs.accentColor) {
    brandHints.push(`primary brand accent color ${vs.accentColor}`);
  }
  if (vs.secondaryAccent) {
    brandHints.push(`secondary accent ${vs.secondaryAccent}`);
  }
  if (vs.backgroundColor) {
    brandHints.push(`background tone ${vs.backgroundColor}`);
  }
  if (vs.vibe) {
    brandHints.push(`brand vibe: ${vs.vibe}`);
  }
  const brandSection = brandHints.length > 0 ? `. Brand palette: ${brandHints.join(', ')}` : '';

  return `${anchor}${slideSpec.visualPrompt}. Visual style: ${mood}. Brand: ${brand.brandName}${brandSection}. Maintain visual consistency across the carousel — same color palette, lighting direction, and mood. Aspect ratio 4:5 (1080x1350px). Negative: no text, no letters, no words, no logos, no watermarks, no close-up human faces unless explicitly described, no clutter.`;
}
