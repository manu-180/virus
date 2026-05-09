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
// Caption prompt — Claude returns a single caption for one framework
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

  const frameworkGuide: Record<CaptionVariant['framework'], string> = {
    'hook-pas-cta':
      'Estructura PAS: Problema (1-2 oraciones que nombran el dolor) → Agitación (consecuencia si no lo resolvés) → Solución (el carrusel + CTA).',
    'hook-aida':
      'Estructura AIDA: Atención (hook disruptivo) → Interés (dato o pregunta que engancha) → Deseo (beneficio concreto) → Acción (CTA directo).',
    contrarian:
      'Estructura contrarian: Empezá cuestionando una creencia común ("Todos dicen X, pero...") → Revelá la verdad contraria → Mostrá la evidencia del carrusel → CTA.',
  };

  return `Sos un copywriter especializado en captions de Instagram para marcas argentinas directas y sin vueltas.

## Contexto de la marca
- Nombre: ${brand.brandName}
- Tono: ${brand.voiceTone}
- Audiencia: ${brand.audience.who}

## Carrusel que estás captionando
Tema: ${brief.topic}
Slides:
${slidesSummary}

## Framework a usar: ${framework}
${frameworkGuide[framework]}

## Reglas
- Español argentino natural, directo, sin corporativismo.
- Entre 120 y 300 caracteres (sin contar hashtags).
- Hook en la primera línea — tiene que parar el scroll.
- Terminá con este CTA exacto: ${brief.cta}
- Al final, incluí entre 5 y 10 hashtags relevantes en una línea separada.
- Sin emojis decorativos excesivos (máximo 2 emojis si suman valor).
- No clickbait: el caption debe entregar lo que promete.

Respondé SOLO con el caption completo (texto + hashtags). Sin explicaciones ni formato extra.`;
}

// ---------------------------------------------------------------------------
// Visual prompt — final prompt for Gemini Imagen per slide
// ---------------------------------------------------------------------------

export function buildVisualPrompt(
  slideSpec: SlideSpec,
  stylePreset: CarouselBrief['stylePreset'],
  brand: ProjectBrand,
): string {
  const moodByPreset: Record<CarouselBrief['stylePreset'], string> = {
    minimal: 'clean, airy, minimalist, soft natural light, muted tones, lots of white space',
    bold: 'high contrast, punchy colors, dynamic composition, strong shadows, energetic',
    editorial:
      'sophisticated, magazine-quality, structured layout, refined color palette, professional',
  };

  const mood = moodByPreset[stylePreset];

  return `${slideSpec.visualPrompt}. Style: ${mood}. Maintain visual consistency with the rest of the carousel series — same color palette, lighting direction, and mood. Aspect ratio 4:5 (1080x1350px). Negative: no text, no letters, no words, no logos, no watermarks, no close-up human faces unless explicitly described, no clutter.`;
}
