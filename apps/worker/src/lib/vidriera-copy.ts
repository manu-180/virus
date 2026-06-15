/**
 * Vidriera-Video — VO script + caption copy (FASE HORNO §3.2).
 *
 * buildVoScriptPrompt / buildCaptionPrompt are PURE prompt builders (unit-tested).
 * generateVoScript / generateCaption (added with the Claude wiring) call
 * @virus/shared/ai and are exercised by the real run. Standing rules (spec §0.7):
 * argentine voseo, warm @apex.stack tone, CLIENT-STYLE framing, NEVER the word
 * "demo".
 */
import { callClaude, MODELS } from '@virus/shared/ai';
import type { DemoRow } from './vidriera-selection.js';

export function buildVoScriptPrompt(demo: DemoRow): string {
  const pitch = demo.pitch?.trim() || '(sin pitch)';
  const tipo = demo.tipo_producto?.trim() || 'sitio web';
  return [
    `Sos el guionista de @apex.stack, el portfolio de APEX (estudio argentino de diseño + software a medida).`,
    `Escribí el guion de la voz en off de un Reel vertical que muestra este trabajo real entregado por APEX:`,
    ``,
    `Título: ${demo.titulo}`,
    `Tipo de producto: ${tipo}`,
    `Pitch: ${pitch}`,
    ``,
    `Requisitos:`,
    `- Español rioplatense con VOSEO natural (nada de español neutro ni tono robótico).`,
    `- 25 a 35 segundos hablados (~70 a 95 palabras).`,
    `- Estructura: gancho → problema → solución → CTA de APEX.`,
    `- Enmarcá el trabajo como un producto/encargo real, con calidez. NUNCA uses la palabra "demo".`,
    `- Cerrá invitando a escribirle a APEX para crear algo a medida.`,
    `- Devolvé SOLO el texto del guion, corrido, sin encabezados ni comillas.`,
  ].join('\n');
}

export function buildCaptionPrompt(demo: DemoRow): string {
  const seed = demo.caption_ig?.trim() || '(sin borrador previo)';
  const tipo = demo.tipo_producto?.trim() || 'sitio web';
  return [
    `Sos el community manager de @apex.stack (portfolio de APEX, estudio argentino de diseño + software a medida).`,
    `Escribí el caption de Instagram del Reel de este trabajo real entregado por APEX:`,
    ``,
    `Título: ${demo.titulo}`,
    `Tipo de producto: ${tipo}`,
    `Pitch: ${demo.pitch?.trim() || '(sin pitch)'}`,
    `Borrador previo (reescribilo, no lo copies textual): ${seed}`,
    ``,
    `Requisitos:`,
    `- Español rioplatense, voseo, cálido y humano (no corporativo).`,
    `- Estilo CLIENTE: enmarcá el trabajo como producto/encargo real. NUNCA uses la palabra "demo" ni inventes nombres de clientes ni testimonios falsos.`,
    `- Gancho fuerte en la primera línea, después qué resuelve, después un CTA suave de APEX.`,
    `- Cerrá con la firma "✨ APEX · diseño + software a medida." y 8-12 hashtags relevantes en una sola línea final.`,
    `- Máximo 2200 caracteres. Devolvé SOLO el caption listo para publicar.`,
  ].join('\n');
}

// ── Claude-backed generators (integration; exercised by the real run) ────────

/**
 * Generate the voice-over script for a demo via Claude. Throws on an empty
 * response so the orchestrator's fail-safes never feed blank subtitles to the
 * editor engine.
 */
export async function generateVoScript(demo: DemoRow): Promise<string> {
  const res = await callClaude({
    model: MODELS.default,
    system:
      'Sos guionista publicitario argentino para redes sociales. Escribís claro, ' +
      'cálido y con voseo natural. Respondés solo con el texto pedido, sin comillas.',
    messages: [{ role: 'user', content: buildVoScriptPrompt(demo) }],
    maxTokens: 600,
  });
  const text = (res.text ?? '').trim();
  if (!text) throw new Error('generateVoScript: Claude returned empty text');
  return text;
}

/**
 * Generate the Instagram caption for a demo via Claude (client-style, never
 * "demo"). Throws on an empty response.
 */
export async function generateCaption(demo: DemoRow): Promise<string> {
  const res = await callClaude({
    model: MODELS.default,
    system:
      'Sos community manager argentino. Escribís captions de Instagram cálidos, ' +
      'con voseo, sin clickbait. Respondés solo con el caption final.',
    messages: [{ role: 'user', content: buildCaptionPrompt(demo) }],
    maxTokens: 800,
  });
  const text = (res.text ?? '').trim();
  if (!text) throw new Error('generateCaption: Claude returned empty text');
  return text;
}
