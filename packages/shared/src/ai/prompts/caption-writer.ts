import { z } from 'zod';
import { callClaude } from '../anthropic.js';
import { MODELS } from '../models.js';
import type { ProjectBrand } from '../../viral/types.js';
import type { ScriptOutput } from './script-writer.js';

export const CaptionOutputSchema = z.object({
  instagram: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()).max(12),
  }),
  tiktok: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()).max(5),
  }),
  shorts: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()).max(3),
  }),
});

export type CaptionOutput = z.infer<typeof CaptionOutputSchema>;

const SYSTEM_PROMPT = `Sos un experto en copywriting para redes sociales (Reels, TikTok, YouTube Shorts).
Escribís captions que maximizan el engagement y las conversiones.

Estructura HVCT para captions:
- Hook: Primera línea que genera curiosidad o dolor (sin "En este video...")
- Value: 2-3 líneas de valor real (lo que aprende/logra el usuario)
- CTA: Acción específica y simple ("Guardalo", "Seguime", "Comentá X")
- Tags: Hashtags estratégicos según plataforma

Reglas por plataforma:
INSTAGRAM REELS:
- Caption: 150-300 caracteres (se corta después de 3 líneas)
- Primera línea: hook de scroll-stop
- Hashtags: 5-12, mezcla de nicho + trending + branded
- Incluí emoji con criterio (1-2 máximo)

TIKTOK:
- Caption: 100-150 caracteres (muy corto, el video habla)
- Hashtags: 3-5, muy específicos al nicho
- Sin emojis en exceso
- Tono más casual y directo

YOUTUBE SHORTS:
- Caption: 200-400 caracteres (más contexto)
- Hashtags: 2-3 máximo (#Shorts obligatorio)
- Más descriptivo del contenido
- Incluí #Shorts siempre

Todos los captions en Spanish argentino conversacional.
Hashtags sin el símbolo # (se agrega automáticamente).`;

const WRITE_CAPTIONS_TOOL = {
  name: 'write_captions',
  description: 'Escribe los captions y hashtags optimizados para cada plataforma.',
  input_schema: {
    type: 'object' as const,
    required: ['instagram', 'tiktok', 'shorts'],
    properties: {
      instagram: {
        type: 'object',
        required: ['caption', 'hashtags'],
        properties: {
          caption: { type: 'string', description: 'Caption para Reels (150-300 chars).' },
          hashtags: {
            type: 'array',
            maxItems: 12,
            items: { type: 'string' },
            description: 'Hashtags sin # (5-12 tags).',
          },
        },
      },
      tiktok: {
        type: 'object',
        required: ['caption', 'hashtags'],
        properties: {
          caption: { type: 'string', description: 'Caption para TikTok (100-150 chars).' },
          hashtags: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string' },
            description: 'Hashtags sin # (3-5 tags).',
          },
        },
      },
      shorts: {
        type: 'object',
        required: ['caption', 'hashtags'],
        properties: {
          caption: { type: 'string', description: 'Caption para YouTube Shorts (200-400 chars).' },
          hashtags: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' },
            description: 'Hashtags sin # (2-3 tags, incluir "Shorts").',
          },
        },
      },
    },
  },
};

export interface WriteCaptionInput {
  script: ScriptOutput;
  hook: string;
  brand: ProjectBrand;
  projectHashtags?: { reels?: string[]; tiktok?: string[]; shorts?: string[] };
}

export async function writeCaption(input: WriteCaptionInput): Promise<CaptionOutput> {
  const { script, hook, brand, projectHashtags } = input;

  const hookSegment = script.segments.find((s) => s.role === 'hook');
  const ctaSegment = script.segments.find((s) => s.role === 'cta');

  const userMessage = [
    `## Video a describir`,
    `**Hook principal:** ${hook}`,
    `**Voiceover del hook:** ${hookSegment?.voiceover ?? ''}`,
    `**CTA del video:** ${ctaSegment?.voiceover ?? ''}`,
    `**Duración:** ${script.totalDurationSec}s`,
    `**Template:** ${script.recommendedTemplate}`,
    '',
    `## Marca: ${brand.brandName}`,
    `**One-liner:** ${brand.oneLiner}`,
    `**Tono:** ${brand.voiceTone}`,
    `**CTAs de marca:** ${brand.ctas.map((c) => `${c.kind}: "${c.value}"`).join(' | ')}`,
    '',
    projectHashtags?.reels?.length
      ? `## Hashtags del proyecto (usá algunos)\nReels: ${projectHashtags.reels.join(', ')}\nTikTok: ${(projectHashtags.tiktok ?? []).join(', ')}\nShorts: ${(projectHashtags.shorts ?? []).join(', ')}`
      : '',
    '',
    'Escribí los captions y hashtags para las 3 plataformas. Adaptá el tono a cada una.',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callClaude({
    model: MODELS.default,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [WRITE_CAPTIONS_TOOL],
    maxTokens: 2048,
  });

  if (result.toolInput === undefined) {
    throw new Error('[caption-writer] No tool_use block in response');
  }

  return CaptionOutputSchema.parse(result.toolInput);
}
