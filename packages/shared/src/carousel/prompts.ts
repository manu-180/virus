import { z } from 'zod';
import type { BrandImageProfile, ProjectBrand } from '../viral/types.js';
import type { CarouselBrief, CaptionVariant, SlideSpec } from './types.js';

// ---------------------------------------------------------------------------
// Slide body sanitization
//
// Bodies were getting silently chopped mid-word in slide PNGs because the
// prompt asked for ≤160 chars, the schema capped at 140, and the sanitizer
// hard-sliced at 140 with no ellipsis or sentence detection. Result: PNG text
// like "puede duplicar tu" with no period and no ellipsis.
//
// The new contract: SHORT, COMPLETE SENTENCES. This helper enforces that.
// It is the single source of truth for slide body trimming, used by both the
// initial plan sanitizer and any future re-plan / regenerate paths.
//
// Strategy (in order):
//  1. If body already ≤ maxLen → return as-is (just trimmed).
//  2. Try to walk back to the last sentence-ending punctuation (. ! ?) within
//     budget. If found, keep through that punctuation — closed sentence,
//     done.
//  3. Otherwise, walk back to the last whitespace within budget, drop any
//     trailing connectives/conjunctions ("y", "pero", "porque", "que",
//     "para", "de", "en", etc.) and trailing punctuation, then append a
//     period. Closed sentence by force.
//  4. If walking back yields an empty string (one giant word — extremely
//     rare), return undefined so the slide renders with no body rather than
//     a half-word.
// ---------------------------------------------------------------------------

const TRAILING_CONNECTIVES = new Set([
  'y', 'e', 'o', 'u', 'pero', 'porque', 'que', 'para', 'por', 'con', 'sin',
  'de', 'del', 'en', 'a', 'al', 'la', 'el', 'los', 'las', 'un', 'una',
  'unos', 'unas', 'lo', 'le', 'les', 'su', 'sus', 'mi', 'tu', 'es', 'son',
  'como', 'si', 'sí', 'ya', 'más', 'menos', 'donde', 'cuando', 'cuanto',
  'cuál', 'cual', 'mientras', 'aunque', 'entonces', 'también', 'tampoco',
  'pues', 'así', 'tan', 'muy', 'no',
]);

export function sanitizeSlideBody(input: string, maxLen = 110): string | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;

  // Already short enough — return as-is. Don't even strip trailing dots; the
  // prompt asks for a final period and we should honor whatever Claude sent
  // if it already fits.
  if (trimmed.length <= maxLen) return trimmed;

  // 1) Try to keep the largest complete sentence (or sequence of sentences)
  //    that fits within budget. Search for the LAST sentence-ending
  //    punctuation in the prefix.
  const prefix = trimmed.slice(0, maxLen);
  const sentenceEnd = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
  );
  if (sentenceEnd > 0) {
    return prefix.slice(0, sentenceEnd + 1).trim();
  }

  // 2) No sentence ends in budget. Walk back to last whitespace, then drop
  //    trailing connectives so we don't end on "y", "pero", "porque", etc.
  let cut = prefix.lastIndexOf(' ');
  if (cut <= 0) {
    // One giant word — nothing safe to render.
    return undefined;
  }

  let candidate = prefix.slice(0, cut).trim();

  // Keep stripping trailing punctuation + connectives until we land on a
  // content word. Cap the loop so we never spin on pathological input.
  for (let i = 0; i < 6; i++) {
    candidate = candidate.replace(/[\s,;:\-–—.!?]+$/u, '');
    const m = candidate.match(/([\p{L}\p{N}]+)\s*$/u);
    if (!m) break;
    const lastWord = m[1]!.toLowerCase();
    if (!TRAILING_CONNECTIVES.has(lastWord)) break;
    candidate = candidate.slice(0, candidate.length - m[1]!.length).trimEnd();
  }

  if (candidate.length === 0) return undefined;

  // Force a final period so the rendered slide reads as a closed thought.
  return /[.!?]$/.test(candidate) ? candidate : `${candidate}.`;
}

// ---------------------------------------------------------------------------
// Slide plan prompt — Claude returns a JSON array of SlideSpec
//
// Narrative arc: rather than a flat checklist of roles, we instruct Claude to
// write a 3-act structure with explicit swipe-baits at the end of each
// intermediate slide body. Why: IG's algorithm rewards swipe-rate + dwell time,
// and intermediate slides without cliffhangers leak both metrics. The first
// slide is always 'hook' and the last is always 'cta' — those two slots carry
// the cinematic opening + loop-closure that wrap the carousel.
//
// Visual side: when the brand has a per-brand `imageProfile.subjectLibrary`,
// we feed Claude role-specific scene archetypes (e.g., for APEX in 'hook' role:
// "fragmented monolith with glowing cyan fissures") and tell it to pick a
// DIFFERENT subject for each slide. This is the fix for "8 photos of the same
// guy at a laptop": the brand decides what kind of imagery represents it, and
// each slide pulls from a curated pool so subjects never repeat.
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_SUBJECT_EXAMPLE =
  '30-year-old argentine man in dark gray hoodie, sitting at minimalist wooden desk, late afternoon window light from left, moody cinematic, brand palette dominates';

/**
 * Decide whether to drive the prompt with the brand's imageProfile (new path)
 * or fall back to the legacy character-anchored example (old path).
 */
function hasImageProfile(brand: ProjectBrand): brand is ProjectBrand & {
  visualStyle: { imageProfile: BrandImageProfile };
} {
  return Boolean(brand.visualStyle?.imageProfile);
}

/**
 * Render the per-role subject library as a section Claude can read while
 * planning slides. Each role gets a numbered list of distinct scene ideas IN
 * ENGLISH (the image model is English-trained); Claude is told to pick one
 * different idea per slide.
 */
function renderSubjectLibrary(profile: BrandImageProfile): string {
  const lib = profile.subjectLibrary ?? {};
  const roles: (keyof typeof lib)[] = ['hook', 'problem', 'insight', 'data', 'example', 'cta'];
  const sections: string[] = [];
  for (const role of roles) {
    const ideas = lib[role];
    if (!ideas || ideas.length === 0) continue;
    const list = ideas.map((s, i) => `    ${i + 1}. ${s}`).join('\n');
    sections.push(`  - ${role}:\n${list}`);
  }
  if (sections.length === 0) return '';
  return sections.join('\n');
}

/**
 * Build the visual-direction block for buildSlidePlanPrompt.
 *
 * Two flavors depending on the brand's `imageProfile`:
 *  - WITH profile (modern): instructs Claude to pick distinct subjects from
 *    the brand's per-role subjectLibrary, anchored to the brand's visual world
 *    (technique + palette + negative rules). Each slide gets a UNIQUE
 *    visualPrompt — no character continuity.
 *  - WITHOUT profile (legacy): the old "30-year-old man at desk" example
 *    that creates same-character chained imagery. Kept for back-compat with
 *    brands that haven't been migrated yet.
 */
function buildVisualDirectionSection(
  brand: ProjectBrand,
  lastIdx: number,
): string {
  if (hasImageProfile(brand)) {
    const profile = brand.visualStyle!.imageProfile;
    const library = renderSubjectLibrary(profile);
    const negatives =
      profile.negativeVisuals.length > 0
        ? `\nRESTRICCIONES VISUALES OBLIGATORIAS (la marca no tolera estos elementos): ${profile.negativeVisuals.join(', ')}.`
        : '';

    const continuityNote =
      profile.subjectStrategy === 'character-anchor'
        ? `Las imágenes están encadenadas: el slide 0 sirve como ANCLA visual para el resto (mismo personaje, misma escena). Pedí variaciones del MISMO sujeto en slides 1..${lastIdx}.`
        : `Las imágenes NO comparten personaje. Cada slide muestra un sujeto DISTINTO del mismo mundo visual (misma paleta, misma iluminación, misma técnica). NO repitas el mismo sujeto en dos slides — eso es exactamente el bug que estamos resolviendo.`;

    return `## Dirección visual (CRÍTICO — el sistema de imagen depende de esto)
La marca ${brand.brandName} tiene un perfil visual cerrado:
- Medio: ${profile.mode}
- Técnica: ${profile.technique}
- Composición: ${profile.composition}
- Mood: ${profile.moodKeywords.join(', ')}
- Estrategia de continuidad: ${profile.subjectStrategy}

${continuityNote}${negatives}

${library ? `## Biblioteca de sujetos por rol (elegí UN sujeto distinto por slide)
Para cada slide del carrusel, elegí UN archetype DIFERENTE del rol correspondiente. NO uses la misma idea en dos slides. Si necesitás más variación de la que hay en la lista, inventá variantes coherentes con el mismo mundo visual (misma paleta + iluminación + técnica).

${library}
` : ''}
## Reglas para visualPrompt (cada slide)
- Idioma: INGLÉS (el modelo de imagen es entrenado en inglés).
- Foco: describí UN sujeto/escena específico de la biblioteca de su rol, adaptado al headline. Sin redescribir la técnica, la paleta o la composición — esos los inyecta el sistema automáticamente desde el imageProfile.
- Sé concreto: forma, materiales, posición, ángulo. NO menciones humanos a menos que la biblioteca explícitamente los incluya.
- Ejemplo BUENO (slide problem, marca tech): "a shattered geometric prism floating mid-air, deep cracks leaking red warning glow, fragments suspended in space".
- Ejemplo MALO (genérico, no usar): "${DEFAULT_HOOK_SUBJECT_EXAMPLE}".`;
  }

  // Legacy path — kept identical to pre-refactor behavior for back-compat
  // with brands that don't have imageProfile populated yet.
  return `## Continuidad visual entre slides (CRÍTICO)
Las imágenes se generan en cadena: la imagen del slide 0 sirve como ANCLA visual para todas las demás (mismo personaje, misma escena, misma paleta, misma iluminación). Tus visualPrompts deben respetar esa continuidad:
- visualPrompt del slide 0 — describe en INGLÉS la escena de portada COMPLETA: subject (humano o objeto), setting, lighting, mood, palette. Esta imagen marcará el universo visual del carrusel. Sé específico: edad, ropa, ambiente, hora del día. Ej: "${DEFAULT_HOOK_SUBJECT_EXAMPLE}".
- visualPrompts de slides 1 a ${lastIdx} — en INGLÉS, asumí que el modelo verá la imagen del slide 0 como referencia. NO redescribas al personaje o el setting completos; pedí variaciones de la misma escena: nuevo ángulo, nueva acción del mismo sujeto, nuevo objeto en el mismo ambiente. Ej: "same subject seen from behind looking at laptop screen showing growth chart", "close-up of the same hands writing in a notebook on the same desk".
- visualPrompt del slide ${lastIdx} — eco visual del slide 0 para cerrar el loop. Ej: "same subject as opening shot, now smiling subtly, same desk and lighting, slight forward lean toward camera".`;
}

export function buildSlidePlanPrompt(brief: CarouselBrief, brand: ProjectBrand): string {
  const doNotSay =
    brand.doNotSay.length > 0
      ? `Never use: ${brand.doNotSay.map((w) => `"${w}"`).join(', ')}.`
      : '';

  const n = brief.slideCount;
  const lastIdx = n - 1;
  const visualDirection = buildVisualDirectionSection(brand, lastIdx);

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
- Slide 1 (role: "problem") — nombra el dolor o la promesa con una oración completa y certera.

ACTO 2 — Confrontación / desarrollo (slides 2 a ${lastIdx - 1})
- Roles permitidos: "insight" | "data" | "example".
- Cada slide entrega UN punto concreto. Nunca dos.
- AL MENOS UNO de estos slides tiene que ser "guardable": un dato duro con número (role "data"), un mini-framework de pasos numerados, una comparación lado a lado, o un checklist (role "insight"/"example"). Tiene que funcionar como referencia que el viewer quiera GUARDAR — el save es la señal más fuerte para el algoritmo. Que sea autocontenido: se entiende sin el resto del carrusel.
- Cada body es una idea CERRADA: una oración (o dos cortas) que se entiende sola, sin depender del slide siguiente. Profesional, directa, sin clickbait ni frases colgadas.
- La continuidad entre slides la da el ORDEN de los conceptos (problema → causa → ejemplo → insight), no frases incompletas. Nada de "pero...", "y acá viene lo interesante...", flechas "→", ni puntos suspensivos al final.

ACTO 3 — Resolución (slides ${lastIdx - 1} y ${lastIdx})
- Slide ${lastIdx - 1} (role: "insight" o "example") — el payoff: la idea principal del carrusel revelada. Es la línea que justifica todo el scroll. Tiene que pegar.
- Slide ${lastIdx} (role: "cta") — cierra el loop volviendo al hook (loop closure). Reformula la promesa del slide 0 como acción. CTA: "${brief.cta}". Body opcional.

## Reglas de texto
- headline: máximo 40 caracteres (CONTÁ antes de escribir). Máximo 5-6 palabras. Genera curiosidad sin clickbait — entregá lo prometido.
- body: ESTRICTO máximo 110 caracteres. UNA sola oración completa, breve, certera, terminada en PUNTO FINAL. Mejor 70 caracteres completos que 110 truncados. Si la idea no entra en 110 caracteres en oración completa, simplificala — quitá adjetivos, quitá ejemplos, quedate con la idea pura. Prohibido: frases colgadas, puntos suspensivos al final, flechas, "pero...", "y acá viene lo interesante", oraciones partidas, conectores finales ("y", "pero", "porque", "que") sin completar. Contá los caracteres antes de responder.
- Sin emojis decorativos. Máximo 1 emoji solo si suma significado real.
- Hablá en "vos" (español argentino), nunca en "tú".
- Si la marca tiene palabras prohibidas (arriba), no aparecen en headlines ni bodies.

${visualDirection}

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
- "body" puede omitirse en slide 0; en slides intermedios es una oración completa ≤ 110 caracteres terminada en punto (sin "...", sin flechas, sin frases colgadas, sin conectores finales sueltos).
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
- Exactamente 5 hashtags de máximo impacto para el nicho del proyecto: priorizá los de mayor volumen de búsqueda e interacción en Instagram, específicos al tema del carrusel y la marca. Sin hashtags genéricos relleno.
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
  hashtags: z.array(z.string().min(1)).min(3).max(5),
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
 * This is layered on TOP of the preset/profile mood (preset describes the
 * brand's visual identity; role describes the slide's job in the narrative
 * arc).
 */
function roleMoodLayer(role: SlideSpec['role']): string {
  switch (role) {
    case 'hook':
      return 'cinematic opening shot, single unmistakable focal subject that still reads at small grid-thumbnail size, maximum stopping power, dramatic directional lighting, strong tonal contrast, magazine-cover energy';
    case 'cta':
      return 'closing shot that mirrors the opening, calm resolved mood, single subject, brand color dominance, leaves visual room for overlay text';
    default:
      return '';
  }
}

/**
 * Premium quality layer injected into EVERY slide's prompt (both the profile
 * and legacy paths). Encodes the 2026 premium-carousel research: editorial
 * lighting, tonal depth, fine grain, restrained palette, and — critically —
 * reserved negative space (especially the lower third, where the text overlay
 * lands) so the composited headline never fights a busy background.
 */
const PREMIUM_QUALITY_LAYER =
  'editorial photography quality, soft directional key light, rich tonal depth, fine natural film grain, restrained premium color palette, crisp focal subject with clean separation from the background, generous uncluttered negative space — especially the lower third — reserved for text overlays, magazine-grade finish';

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
   * setting + palette, and to apply this slide's variation on top.
   *
   * Only meaningful when the brand's `subjectStrategy` is `character-anchor`
   * (or the legacy fallback). For `world-anchor` brands, the batch never
   * passes a reference image, so this stays false.
   */
  hasReferenceImage?: boolean;
  /**
   * When set, instructs Gemini to render the brand name as part of the artwork
   * itself — display typography baked into the composition (think magazine
   * cover lettering, brutalist poster type, environmental signage). This is
   * the "brand stamp" mechanism: instead of compositing a Satori overlay on
   * top of a clean photo (which always reads as a watermark), we ask the
   * image model to spell the name as a designed element of the scene.
   *
   * Only ONE slide per carousel should receive this; the caller picks the idx
   * via `pickBrandStampIdx`. When this option is set, the prompt's "no text"
   * negative is dropped so Gemini is free to render letters in that slide.
   */
  brandTypography?: { brandName: string };
}

/**
 * Build a visual prompt for a single slide.
 *
 * Decision tree:
 *  1. If brand has `imageProfile` → compose from profile (mode + technique +
 *     composition + mood + negatives + palette + topic + per-slide visualPrompt).
 *  2. Else → legacy preset-driven path (back-compat).
 *
 * Backwards-compatible overloads (kept identical to pre-refactor):
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
  const opts: BuildVisualPromptOptions =
    typeof topicOrOptions === 'string'
      ? { topic: topicOrOptions }
      : (topicOrOptions ?? {});

  if (hasImageProfile(brand)) {
    return buildVisualPromptFromProfile(slideSpec, brand, opts);
  }
  return buildVisualPromptLegacy(slideSpec, stylePreset, brand, opts);
}

// ---------------------------------------------------------------------------
// New path — driven by per-brand imageProfile
// ---------------------------------------------------------------------------

function buildVisualPromptFromProfile(
  slideSpec: SlideSpec,
  brand: ProjectBrand & { visualStyle: { imageProfile: BrandImageProfile } },
  opts: BuildVisualPromptOptions,
): string {
  const profile = brand.visualStyle.imageProfile;
  const vs = brand.visualStyle;
  const roleMood = roleMoodLayer(slideSpec.role);

  // Anchor block: tell the model what visual world to render in (technique +
  // composition + mood). This is the same for every slide of the carousel,
  // so the whole series shares a visual grammar.
  const moodParts = [...profile.moodKeywords];
  if (roleMood) moodParts.unshift(roleMood);
  const moodLine = moodParts.join(', ');

  // Palette hints from the brand's color tokens. Same colors across every
  // slide reinforce continuity even without image-to-image chaining.
  const paletteHints: string[] = [];
  if (vs.accentColor) paletteHints.push(`primary accent ${vs.accentColor}`);
  if (vs.secondaryAccent) paletteHints.push(`secondary accent ${vs.secondaryAccent}`);
  if (vs.backgroundColor) paletteHints.push(`background tone ${vs.backgroundColor}`);
  if (vs.vibe) paletteHints.push(`brand vibe: ${vs.vibe}`);
  const paletteLine = paletteHints.length > 0 ? `Brand palette: ${paletteHints.join(', ')}. ` : '';

  // Scene anchor: the carousel topic keeps all slides on-subject.
  const anchor =
    opts.topic != null && opts.topic.trim().length > 0
      ? `Scene context: ${opts.topic.trim()}. `
      : '';

  // Reference directive: only emitted when the strategy actually uses
  // image-to-image chaining (character-anchor) AND a reference image was
  // attached. For world-anchor brands this stays off — continuity comes from
  // the strong text prompt, not from a reference image.
  const referenceDirective =
    opts.hasReferenceImage && profile.subjectStrategy === 'character-anchor'
      ? 'Use the attached image as the canonical visual reference. Keep the SAME character/subject identity, the SAME setting style, the SAME color palette, lighting direction, and overall mood. Only vary what this slide describes — new angle, new action, new framing, or a new object within the same world. Do NOT reinvent the person or scene. '
      : '';

  // Negatives. Each item gets prefixed `no ` only if it doesn't already start
  // with "no " — this lets users write either "humans" or "no humans" in the
  // profile and both work.
  //
  // When `brandTypography` is set, we DROP the generic "no text/letters/words"
  // ban so Gemini is free to render the brand name as designed lettering in
  // the scene. "no watermarks, no logos" stays — we want typography, not a
  // logo bug or a stamped graphic.
  const normalizedNegatives = profile.negativeVisuals.map((n) =>
    n.toLowerCase().trim().startsWith('no ') ? n.trim() : `no ${n.trim()}`,
  );
  const wantsBrandText = opts.brandTypography && opts.brandTypography.brandName.trim().length > 0;
  const textNegatives = wantsBrandText
    ? 'no extra text beyond the brand name, no watermarks, no logos, no UI elements'
    : 'no text, no letters, no words, no watermarks';
  const negativesLine = normalizedNegatives.length > 0
    ? `Negative: ${normalizedNegatives.join(', ')}, ${textNegatives}.`
    : `Negative: ${textNegatives}.`;

  // Brand typography directive — only emitted on the slide chosen by the
  // caller. Asks the image model to integrate the brand name as a designed
  // element of the scene (display lettering baked into the composition),
  // NOT as a watermark or overlay. Phrasing borrowed from cinematography /
  // graphic-design vocabulary because that's the visual register we want.
  const brandTypographyDirective = wantsBrandText
    ? `Integrate the word "${opts.brandTypography!.brandName.trim()}" as bold display typography that is part of the artwork itself — treated like magazine-cover lettering, brutalist poster type, or environmental signage built into the scene. The letters must share the same lighting, palette, materials, and perspective as the rest of the image, as if photographed or painted along with the subject. NOT a watermark, NOT a logo stamp, NOT a flat text overlay. Spell it exactly: "${opts.brandTypography!.brandName.trim()}". Render it once, prominently, with intentional composition.`
    : '';

  // Final assembly. Order matters for Gemini: the per-slide visualPrompt
  // (concrete subject) goes first so it dominates, then the consistent world
  // description follows to lock it into the brand's universe.
  return [
    referenceDirective + anchor + slideSpec.visualPrompt + '.',
    `Medium: ${profile.mode}.`,
    `Technique: ${profile.technique}.`,
    `Composition: ${profile.composition}.`,
    `Mood: ${moodLine}.`,
    PREMIUM_QUALITY_LAYER + '.',
    paletteLine + `Brand: ${brand.brandName}.`,
    brandTypographyDirective,
    'Aspect ratio 4:5 (1080x1350px).',
    negativesLine,
  ]
    .filter((s) => s.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Legacy path — preset-driven, kept for back-compat with brands that don't
// yet have an imageProfile populated. Identical behavior to pre-refactor.
// ---------------------------------------------------------------------------

function buildVisualPromptLegacy(
  slideSpec: SlideSpec,
  stylePreset: CarouselBrief['stylePreset'],
  brand: ProjectBrand,
  opts: BuildVisualPromptOptions,
): string {
  // Background mood for the LEGACY image path (brands without an imageProfile).
  // The 3 core presets keep their hand-tuned mood; every other style — and any
  // future one — falls back to a neutral premium background so a widened style
  // union never breaks this (and the legacy path only affects un-migrated brands).
  const moodByPreset: Record<string, string> = {
    minimal:
      'soft cream background, subtle texture, high-key lighting, lots of negative space, no text',
    bold:
      'high contrast scene, dramatic lighting, vivid saturated colors, cinematic, no text',
    editorial:
      'magazine editorial photography, muted desaturated tones, film grain, no text',
  };

  const presetMood =
    moodByPreset[stylePreset] ??
    'clean premium background, balanced soft lighting, brand-forward color palette, generous negative space reserved for overlay text, no text';
  const roleMood = roleMoodLayer(slideSpec.role);
  const mood = roleMood ? `${roleMood}. ${presetMood}` : presetMood;

  const anchor =
    opts.topic != null && opts.topic.trim().length > 0
      ? `Scene context: ${opts.topic.trim()}. `
      : '';

  const referenceDirective = opts.hasReferenceImage
    ? 'Use the attached image as the canonical visual reference. Keep the SAME character/subject identity, the SAME setting style, the SAME color palette, lighting direction, and overall mood. Only vary what this slide describes — new angle, new action, new framing, or a new object within the same world. Do NOT reinvent the person or scene. '
    : '';

  const vs = brand.visualStyle ?? {};
  const brandHints: string[] = [];
  if (vs.accentColor) brandHints.push(`primary brand accent color ${vs.accentColor}`);
  if (vs.secondaryAccent) brandHints.push(`secondary accent ${vs.secondaryAccent}`);
  if (vs.backgroundColor) brandHints.push(`background tone ${vs.backgroundColor}`);
  if (vs.vibe) brandHints.push(`brand vibe: ${vs.vibe}`);
  const brandSection = brandHints.length > 0 ? `. Brand palette: ${brandHints.join(', ')}` : '';

  // When the slide is the "branded" pick, drop the generic text negative and
  // add an integration directive so Gemini renders the name as part of the
  // artwork (see buildVisualPromptFromProfile for the design rationale).
  const wantsBrandText = opts.brandTypography && opts.brandTypography.brandName.trim().length > 0;
  const brandTypographyDirective = wantsBrandText
    ? ` Integrate the word "${opts.brandTypography!.brandName.trim()}" as bold display typography that is part of the artwork itself — magazine-cover lettering, brutalist poster type, or environmental signage built into the scene, sharing the same lighting, palette, materials, and perspective as the subject. NOT a watermark, NOT a logo stamp, NOT a flat text overlay. Spell it exactly: "${opts.brandTypography!.brandName.trim()}". Render it once, prominently, with intentional composition.`
    : '';
  const negative = wantsBrandText
    ? 'Negative: no extra text beyond the brand name, no logos, no watermarks, no close-up human faces unless explicitly described, no clutter.'
    : 'Negative: no text, no letters, no words, no logos, no watermarks, no close-up human faces unless explicitly described, no clutter.';

  return `${referenceDirective}${anchor}${slideSpec.visualPrompt}. Visual style: ${mood}. ${PREMIUM_QUALITY_LAYER}. Brand: ${brand.brandName}${brandSection}.${brandTypographyDirective} Maintain visual consistency across the carousel — same color palette, lighting direction, and mood. Aspect ratio 4:5 (1080x1350px). ${negative}`;
}
