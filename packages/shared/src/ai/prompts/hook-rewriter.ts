import { z } from 'zod';
import { callClaude } from '../anthropic.js';
import { MODELS } from '../models.js';
import type { HookType } from '../../viral/types.js';

const VariantSchema = z.object({
  hook: z.string(),
  explanation: z.string(),
});

export const HookRewriterOutputSchema = z.object({
  variants: z.array(VariantSchema).length(5),
});

export type HookRewriterOutput = z.infer<typeof HookRewriterOutputSchema>;

const SYSTEM_PROMPT = `Sos un experto en hooks virales para video corto (Reels, TikTok, Shorts).
Tu especialidad es reescribir la primera línea de un video para maximizar el scroll-stop.

Técnicas de hook probadas:
- curiosity_gap: "Lo que nadie te dijo sobre..." / "El secreto que los expertos ocultan..."
- shame_relief: "Si todavía hacés X, estás perdiendo tiempo/plata/oportunidades..."
- shock_contrarian: "X está muerto. Acá por qué..." / "Dejé de hacer X y esto pasó..."
- immediate_value: "3 formas de X en menos de Y minutos..." / "Hacé esto ahora y..."
- fomo: "El 90% de [audiencia] no sabe esto todavía..." / "Antes de que desaparezca..."
- identity_insider: "Si sos [identidad], esto es para vos..." / "Los que entienden X saben que..."
- speed_build_demo: "Construí X en Y segundos. Mirá..." / "Watch me build X from scratch..."
- storytelling: "La historia de cómo X me costó/cambió/enseñó..." / "Hace 6 meses, [situación]..."

Reglas:
- Máximo 10 palabras por hook
- Spanish argentino conversacional
- Cada variante debe usar una técnica diferente
- El hook debe funcionar SIN contexto previo (alguien que no conoce la cuenta)
- Usá números específicos cuando aplique (más creíble que "varios")`;

const REWRITE_HOOKS_TOOL = {
  name: 'rewrite_hooks',
  description: 'Genera 5 variantes del hook original usando diferentes técnicas de scroll-stop.',
  input_schema: {
    type: 'object' as const,
    required: ['variants'],
    properties: {
      variants: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['hook', 'explanation'],
          properties: {
            hook: { type: 'string', description: 'El hook reescrito (máx 10 palabras).' },
            explanation: { type: 'string', description: 'Técnica usada y por qué funciona (1 oración).' },
          },
        },
      },
    },
  },
};

export interface RewriteHookInput {
  originalHook: string;
  topic: string;
  targetEmotion?: HookType;
  audience?: string;
}

export async function rewriteHook(input: RewriteHookInput): Promise<HookRewriterOutput> {
  const { originalHook, topic, targetEmotion, audience } = input;

  const userMessage = [
    `## Hook original`,
    `"${originalHook}"`,
    '',
    `## Contexto del video`,
    `**Tema:** ${topic}`,
    targetEmotion ? `**Emoción objetivo:** ${targetEmotion}` : '',
    audience ? `**Audiencia:** ${audience}` : '',
    '',
    'Generá 5 variantes del hook usando técnicas diferentes. Variá el estilo (pregunta, afirmación, shock, FOMO, etc.).',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callClaude({
    model: MODELS.default,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [REWRITE_HOOKS_TOOL],
    maxTokens: 1024,
  });

  if (result.toolInput === undefined) {
    throw new Error('[hook-rewriter] No tool_use block in response');
  }

  return HookRewriterOutputSchema.parse(result.toolInput);
}
