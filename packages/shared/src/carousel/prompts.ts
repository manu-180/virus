import { z } from 'zod';
import type { ProjectBrand } from '../viral/types.js';
import type { CarouselBrief, CaptionVariant, SlideSpec } from './types.js';

// ---------------------------------------------------------------------------
// Slide plan prompt — Claude returns a JSON array of SlideSpec
//
// Narrative arc: rather than a flat checklist of roles, we instruct Claude to
// write a 3-act structure with explicit swipe-baits at the end of each
// intermediate slide body. Why: IG's algorithm rewards swipe-rate + dwell time,
// and intermediate slides without cliffhangers leak both metrics. The first
// slide is always 'hook' and the last is always 'cta' — those two slots carry
// the cinematic opening + loop-closure that wrap the carousel.
// ---------------------------------------------------------------------------

export function buildSlidePlanPrompt(brief: CarouselBrief, brand: ProjectBrand): string {
  const doNotSay =
    brand.doNotSay.length > 0
      ? `Never use: ${brand.doNotSay.map((w) => `"${w}"`).join(', ')}.`
      : '';

  const n = brief.slideCount;
  const lastIdx = n - 1;

  return `Sos un estratega de contenido para Instagram especializado en carruseles de alto engagement que generan seguidores nuevos.

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
- Slides: ${n}
- CTA final: ${brief.cta}

## Arco narrativo obligatorio (3 actos)
El carrusel es UNA historia con principio, medio y final. No es una lista de bullets.

ACTO 1 — Setup (slide 0 y 1)
- Slide 0 (role: "hook") — abre la historia. Una sola idea, contrarian o sorprendente. Headline ≤ 6 palabras o pregunta corta que pare el scroll. Sin body. Es la portada.
- Slide 1 (role: "problem") — agita el dolor o nombra la promesa: "esto es lo que vas a aprender" / "esto te pasa si...". Body opcional, 1 oración seca.

ACTO 2 — Confrontación / desarrollo (slides 2 a ${lastIdx - 1})
- Roles permitidos: "insight" | "data" | "example".
- Cada slide entrega UN punto concreto. Nunca dos.
- CADA body de slides intermedios debe terminar con un swipe-bait: una frase incompleta, una pregunta abierta, "pero...", "y acá viene lo interesante...", "el problema real es otro →", un dato sin contexto que el próximo slide cierra. El swipe-bait debe sentirse natural, no forzado.
- El slide siguiente RESPONDE el bait del anterior. Es una cadena. Hilá los headlines.

ACTO 3 — Resolución (slides ${lastIdx - 1} y ${lastIdx})
- Slide ${lastIdx - 1} (role: "insight" o "example") — el payoff: la idea principal del carrusel revelada. Es la línea que justifica todo el scroll. Tiene que pegar.
- Slide ${lastIdx} (role: "cta") — cierra el loop volviendo al hook (loop closure). Reformula la promesa del slide 0 como acción. CTA: "${brief.cta}". Body opcional.

## Reglas de texto
- headline: máximo 60 caracteres. Genera curiosidad sin clickbait — entregá lo prometido.
- body: máximo 140 caracteres. En slides intermedios debe terminar en swipe-bait (ver Acto 2).
- Sin emojis decorativos. Máximo 1 emoji solo si suma significado real.
- Hablá en "vos" (español argentino), nunca en "tú".
- Si la marca tiene palabras prohibidas (arriba), no aparecen en headlines ni bodies.

## Continuidad visual entre slides (CRÍTICO)
Las imágenes se generan en cadena: la imagen del slide 0 sirve como ANCLA visual para todas las demás (mismo personaje, misma escena, misma paleta, misma iluminación). Tus visualPrompts deben respetar esa continuidad:
- visualPrompt del slide 0 — describe en INGLÉS la escena de portada COMPLETA: subject (humano o objeto), setting, lighting, mood, palette. Esta imagen marcará el universo visual del carrusel. Sé específico: edad, ropa, ambiente, hora del día. Ej: "30-year-old argentine man in dark gray hoodie, sitting at minimalist wooden desk, late afternoon window light from left, moody cinematic, brand palette dominates".
- visualPrompts de slides 1 a ${lastIdx} — en INGLÉS, asumí que el modelo verá la imagen del slide 0 como referencia. NO redescribas al personaje o el setting completos; pedí variaciones de la misma escena: nuevo ángulo, nueva acción del mismo sujeto, nuevo objeto en el mismo ambiente. Ej: "same subject seen from behind looking at laptop screen showing growth chart", "close-up of the same hands writing in a notebook on the same desk".
- visualPrompt del slide ${lastIdx} — eco visual del slide 0 para cerrar el loop. Ej: "same subject as opening shot, now smiling subtly, same desk and lighting, slight forward lean toward camera".

## Output
Respondé ÚNICAMENTE con un JSON array válido de ${n} objetos con esta forma exacta:
[
  {
    "idx": 0,
    "role": "hook",
    "headline": "...",
    "body": "...",
    "visualPrompt": "..."
  }
]
Reglas estrictas del JSON:
- idx va de 0 a ${lastIdx} en orden.
- slide 0.role === "hook" SIEMPRE.
- slide ${lastIdx}.role === "cta" SIEMPRE.
- slide 1.role === "problem" en lo posible.
- slides intermedios usan "insight" | "data" | "example".
- "body" puede omitirse en slide 0; en slides intermedios debe terminar con swipe-bait.
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
 * Role-specific mood layer.
 *
 * - 'hook' gets a cinematic opening treatment (max stopping power).
 * - 'cta' gets a "loop closure" treatment that echoes the hook visually.
 * - All others fall through to the brief's stylePreset mood.
 *
 * This is layered on TOP of the preset mood (preset describes the brand's
 * visual identity; role describes the slide's job in the narrative arc).
 */
function roleMoodLayer(role: SlideSpec['role']): string {
  switch (role) {
    case 'hook':
      return 'cinematic opening shot, single focal subject, maximum stopping power, dramatic lighting, strong tonal contrast, magazine-cover energy';
    case 'cta':
      return 'closing shot that mirrors the opening, calm resolved mood, single subject, brand color dominance, leaves visual room for overlay text';
    default:
      return '';
  }
}

export interface BuildVisualPromptOptions {
  /**
   * The carousel topic (brief.topic) used as a "scene anchor" so all slides in
   * the same carousel stay visually coherent. Pass it from the outer loop so
   * Gemini anchors every image to the same subject matter.
   */
  topic?: string;
  /**
   * When true, the prompt is shaped for image-to-image generation: it tells the
   * model to treat the attached reference image as the canonical character +
   * setting + palette, and to apply this slide's variation on top. Used for
   * every slide AFTER the hook (slide 0) so the carousel reads as one
   * continuous visual story.
   */
  hasReferenceImage?: boolean;
}

/**
 * Build a visual prompt for a single slide.
 *
 * Backwards-compatible overloads:
 * - `buildVisualPrompt(slide, preset, brand)` — no scene anchor
 * - `buildVisualPrompt(slide, preset, brand, topic)` — legacy form
 * - `buildVisualPrompt(slide, preset, brand, { topic, hasReferenceImage })` — new form
 */
export function buildVisualPrompt(
  slideSpec: SlideSpec,
  stylePreset: CarouselBrief['stylePreset'],
  brand: ProjectBrand,
  topicOrOptions?: string | BuildVisualPromptOptions,
): string {
  const moodByPreset: Record<CarouselBrief['stylePreset'], string> = {
    minimal:
      'soft cream background, subtle texture, high-key lighting, lots of negative space, no text',
    bold:
      'high contrast scene, dramatic lighting, vivid saturated colors, cinematic, no text',
    editorial:
      'magazine editorial photography, muted desaturated tones, film grain, no text',
  };

  const opts: BuildVisualPromptOptions =
    typeof topicOrOptions === 'string'
      ? { topic: topicOrOptions }
      : (topicOrOptions ?? {});

  const presetMood = moodByPreset[stylePreset];
  const roleMood = roleMoodLayer(slideSpec.role);
  const mood = roleMood ? `${roleMood}. ${presetMood}` : presetMood;

  // Scene anchor: tie every slide to the same topic so the carousel reads as
  // one cohesive visual series. The individual visualPrompt adds per-slide
  // variation. When a reference image is attached, the anchor is implicit in
  // the image itself, but we still keep the topic for the text prompt.
  const anchor = opts.topic != null && opts.topic.trim().length > 0
    ? `Scene context: ${opts.topic.trim()}. `
    : '';

  // When chaining slide 0 -> slide N via image-to-image, prepend a directive
  // that anchors visual continuity to the reference image. This is the single
  // biggest lever for "same character across the whole carousel" — without it,
  // Gemini reinvents the subject every call.
  const referenceDirective = opts.hasReferenceImage
    ? 'Use the attached image as the canonical visual reference. Keep the SAME character/subject identity, the SAME setting style, the SAME color palette, lighting direction, and overall mood. Only vary what this slide describes — new angle, new action, new framing, or a new object within the same world. Do NOT reinvent the person or scene. '
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

  return `${referenceDirective}${anchor}${slideSpec.visualPrompt}. Visual style: ${mood}. Brand: ${brand.brandName}${brandSection}. Maintain visual consistency across the carousel — same color palette, lighting direction, and mood. Aspect ratio 4:5 (1080x1350px). Negative: no text, no letters, no words, no logos, no watermarks, no close-up human faces unless explicitly described, no clutter.`;
}
