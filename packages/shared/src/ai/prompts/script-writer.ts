import { z } from 'zod';
import { callClaude } from '../anthropic.js';
import { MODELS } from '../models.js';
import type { ProjectPatterns, ProjectBrand, PacingRules } from '../../viral/types.js';
import type { VideoFormat } from './idea-generator.js';

const SegmentRoleSchema = z.enum(['hook', 'setup', 'development', 'mini_payoff', 'reveal', 'cta']);

const SoundEffectSchema = z.enum(['whoosh', 'click', 'ding', 'glitch', 'pop']).nullable();

const SegmentSchema = z.object({
  index: z.number().int().min(0),
  role: SegmentRoleSchema,
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  voiceover: z.string(),
  onScreenText: z.string().optional(),
  visualCue: z.string(),
  codeSnippet: z
    .object({ language: z.string(), code: z.string() })
    .optional(),
  soundEffect: SoundEffectSchema.optional(),
});

export const ScriptOutputSchema = z.object({
  segments: z.array(SegmentSchema).min(2),
  totalDurationSec: z.number().min(15).max(60),
  recommendedTemplate: z.enum(['tip', 'hot_take', 'speed_build', 'listicle', 'story', 'comparison']),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  musicMood: z.enum(['lofi', 'synthwave', 'phonk', 'cinematic']),
});

export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

const SYSTEM_PROMPT = `Sos un guionista experto en videos cortos virales (Reels, TikTok, Shorts).
Escribís scripts de 15 a 60 segundos con estructura probada para retención máxima.

Estructura anatómica del video:
- 0–2s: Hook (scroll-stop, dolor o curiosidad inmediata)
- 3–6s: Setup (contexto mínimo, no más de lo necesario)
- 6–18s: Development (contenido de valor, ideas densas)
- 18–24s: Mini-payoff (reward parcial, mantiene el enganche)
- 24–28s: Reveal (el giro o insight principal)
- 28–30s: CTA (acción clara y simple)

Reglas de narración:
- Spanish argentino conversacional: "vos", "che"
- Velocidad: 1.1x–1.3x mental (frases cortas, sin relleno)
- Una idea por segundo de desarrollo
- Voiceover en primera persona o segunda persona directa
- Visual cue: describí exactamente qué se ve en pantalla
- On-screen text: la frase impacto de cada segmento (máx 6 palabras)
- Sound effects: usá con criterio (no más de 2-3 por video)

Colores de tema (hex): elegí según emoción del video.
Music mood: lofi=chill/educativo, synthwave=tech/futuro, phonk=energía/contrarian, cinematic=story/drama`;

const WRITE_SCRIPT_TOOL = {
  name: 'write_script',
  description: 'Escribe el script completo del video con todos los segmentos temporalizados.',
  input_schema: {
    type: 'object' as const,
    required: ['segments', 'totalDurationSec', 'recommendedTemplate', 'themeColor', 'musicMood'],
    properties: {
      segments: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          required: ['index', 'role', 'startSec', 'endSec', 'voiceover', 'visualCue'],
          properties: {
            index: { type: 'integer', minimum: 0 },
            role: { type: 'string', enum: ['hook', 'setup', 'development', 'mini_payoff', 'reveal', 'cta'] },
            startSec: { type: 'number', minimum: 0 },
            endSec: { type: 'number', minimum: 0 },
            voiceover: { type: 'string', description: 'Texto exacto que narra el locutor.' },
            onScreenText: { type: 'string', description: 'Texto en pantalla (máx 6 palabras). Opcional.' },
            visualCue: { type: 'string', description: 'Descripción de qué se ve en pantalla.' },
            codeSnippet: {
              type: 'object',
              properties: {
                language: { type: 'string' },
                code: { type: 'string' },
              },
              required: ['language', 'code'],
              description: 'Fragmento de código si el segmento lo requiere. Opcional.',
            },
            soundEffect: {
              type: 'string',
              enum: ['whoosh', 'click', 'ding', 'glitch', 'pop'],
              nullable: true,
              description: 'Efecto de sonido al inicio del segmento. Null si no aplica.',
            },
          },
        },
      },
      totalDurationSec: { type: 'number', minimum: 15, maximum: 60 },
      recommendedTemplate: {
        type: 'string',
        enum: ['tip', 'hot_take', 'speed_build', 'listicle', 'story', 'comparison'],
      },
      themeColor: { type: 'string', description: 'Color hex principal del video (ej: #FF5733).' },
      musicMood: { type: 'string', enum: ['lofi', 'synthwave', 'phonk', 'cinematic'] },
    },
  },
};

export interface WriteScriptInput {
  hook: string;
  angle: string;
  format: VideoFormat;
  estimatedDurationSec: number;
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  pacing?: PacingRules;
}

export async function writeScript(input: WriteScriptInput): Promise<ScriptOutput> {
  const { hook, angle, format, estimatedDurationSec, patterns, brand, pacing } = input;

  const p = pacing ?? patterns.pacing;

  const userMessage = [
    `## Idea a desarrollar`,
    `**Hook:** ${hook}`,
    `**Ángulo:** ${angle}`,
    `**Formato:** ${format}`,
    `**Duración objetivo:** ${estimatedDurationSec}s`,
    '',
    `## Marca: ${brand.brandName}`,
    `**Tono:** ${brand.voiceTone}`,
    `**CTAs disponibles:** ${brand.ctas.map((c) => `${c.kind}: ${c.value}`).join(' | ')}`,
    `**No decir:** ${brand.doNotSay.join(', ')}`,
    '',
    `## Reglas de pacing`,
    `- Cut cada ${p.cutEverySec.min}–${p.cutEverySec.max}s`,
    `- Densidad de ideas: 1 cada ${p.ideaDensitySec}s`,
    '',
    `## CTAs preferidos de la marca`,
    brand.ctas.map((c) => `- ${c.kind}: "${c.value}"`).join('\n'),
    '',
    'Escribí el script completo. Los timestamps de los segmentos deben ser continuos y sumar exactamente totalDurationSec.',
  ].join('\n');

  const result = await callClaude({
    model: MODELS.default,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [WRITE_SCRIPT_TOOL],
    maxTokens: 4096,
  });

  if (result.toolInput === undefined) {
    throw new Error('[script-writer] No tool_use block in response');
  }

  const parsed = ScriptOutputSchema.parse(result.toolInput);

  const lastSegment = parsed.segments[parsed.segments.length - 1];
  if (lastSegment && Math.abs(lastSegment.endSec - parsed.totalDurationSec) > 0.5) {
    throw new Error(
      `[script-writer] Duration mismatch: segments end at ${lastSegment.endSec}s but totalDurationSec=${parsed.totalDurationSec}`,
    );
  }

  return parsed;
}
