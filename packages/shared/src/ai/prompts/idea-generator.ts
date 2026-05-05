import { z } from 'zod';
import { callClaude } from '../anthropic.js';
import { MODELS } from '../models.js';
import type { ProjectPatterns, ProjectBrand } from '../../viral/types.js';
import type { TrendSignal } from '../../viral/trend-aggregator.js';

export type VideoFormat = 'tip' | 'hot_take' | 'speed_build' | 'listicle' | 'story' | 'comparison';

const IdeaSchema = z.object({
  hook: z.string(),
  angle: z.string(),
  format: z.enum(['tip', 'hot_take', 'speed_build', 'listicle', 'story', 'comparison']),
  estimatedDurationSec: z.number().int().min(15).max(60),
  targetEmotion: z.enum([
    'curiosity_gap',
    'shame_relief',
    'shock_contrarian',
    'immediate_value',
    'fomo',
    'identity_insider',
    'speed_build_demo',
    'storytelling',
  ]),
  rationale: z.string(),
  riskLevel: z.enum(['safe', 'edgy', 'high-risk']),
});

export const IdeasOutputSchema = z.object({
  ideas: z.array(IdeaSchema).length(5),
});

export type IdeaGeneratorOutput = z.infer<typeof IdeasOutputSchema>;

const SYSTEM_PROMPT = `Sos un estratega experto en contenido viral para redes sociales (Reels, TikTok, Shorts).
Tu rol es generar ideas de video de alto impacto basadas en patrones probados de viralidad.

Principios clave:
- Los primeros 2 segundos son todo: el hook debe generar curiosidad o dolor inmediato
- Spanish argentino conversacional: "vos", "che", "boludo" (según el tono de la marca)
- Formatos que funcionan: tip rápido, hot take contrarian, speed build/demo, listicle, story con giro, comparación
- Cada idea debe tener una emoción dominante clara: curiosidad, alivio de vergüenza, shock, valor inmediato, FOMO, identidad insider, storytelling
- Priorizá ideas que el creador puede producir solo con celular + screen recording

Criterios de selección de ideas:
1. ¿El hook genera scroll-stop en 2 segundos?
2. ¿Hay un payoff claro al final?
3. ¿La duración se ajusta al formato (15-60s)?
4. ¿Diferencia a la marca de competidores genéricos?`;

const GENERATE_IDEAS_TOOL = {
  name: 'generate_ideas',
  description: 'Genera exactamente 5 ideas de video viral basadas en los patrones y marca del proyecto.',
  input_schema: {
    type: 'object' as const,
    properties: {
      ideas: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['hook', 'angle', 'format', 'estimatedDurationSec', 'targetEmotion', 'rationale', 'riskLevel'],
          properties: {
            hook: { type: 'string', description: 'Primera línea del video (máx 10 palabras). Debe causar scroll-stop.' },
            angle: { type: 'string', description: 'El ángulo o perspectiva única de esta idea (1-2 oraciones).' },
            format: {
              type: 'string',
              enum: ['tip', 'hot_take', 'speed_build', 'listicle', 'story', 'comparison'],
              description: 'Template de Remotion a usar.',
            },
            estimatedDurationSec: { type: 'integer', minimum: 15, maximum: 60, description: 'Duración estimada en segundos.' },
            targetEmotion: {
              type: 'string',
              enum: ['curiosity_gap', 'shame_relief', 'shock_contrarian', 'immediate_value', 'fomo', 'identity_insider', 'speed_build_demo', 'storytelling'],
              description: 'Emoción dominante que activa la retención.',
            },
            rationale: { type: 'string', description: 'Por qué esta idea tiene potencial viral (1-2 oraciones).' },
            riskLevel: {
              type: 'string',
              enum: ['safe', 'edgy', 'high-risk'],
              description: 'Nivel de riesgo del contenido.',
            },
          },
        },
      },
    },
    required: ['ideas'],
  },
};

export interface GenerateIdeasInput {
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  topic?: string;
  pillarHint?: string;
  trends?: TrendSignal[];
}

function buildTrendsSection(trends: TrendSignal[]): string {
  if (trends.length === 0) return '';
  const topTrends = trends.slice(0, 10);
  const lines = topTrends.map((t, i) => {
    const title = (t.title).replace(/\s+/g, ' ').trim().slice(0, 120);
    return `${i + 1}. ${title} — ${t.category}`;
  });
  return [
    'Tendencias frescas (últimos 7 días, ordenadas por relevancia):',
    ...lines,
    '',
    'Tomá en cuenta estas tendencias para sugerir hooks que estén "on the moment".',
  ].join('\n');
}

export async function generateIdeas(input: GenerateIdeasInput): Promise<IdeaGeneratorOutput> {
  const { patterns, brand, topic, pillarHint, trends } = input;

  const systemPrompt =
    trends && trends.length > 0
      ? `${SYSTEM_PROMPT}\n\n${buildTrendsSection(trends)}`
      : SYSTEM_PROMPT;

  const userMessage = [
    `## Proyecto: ${brand.brandName}`,
    `**One-liner:** ${brand.oneLiner}`,
    `**Audiencia:** ${brand.audience.who} en ${brand.audience.where}`,
    `**Dolores principales:** ${brand.audience.pains.join(', ')}`,
    `**Value props:** ${brand.valueProps.join(', ')}`,
    `**Tono:** ${brand.voiceTone}`,
    `**No decir:** ${brand.doNotSay.join(', ')}`,
    '',
    `## Patrones probados del proyecto`,
    `**Hooks top:** ${patterns.hooks.slice(0, 5).map((h) => h.text).join(' | ')}`,
    `**Formatos activos:** ${patterns.formats.map((f) => f.name).join(', ')}`,
    `**Temas relevantes:** ${patterns.topics.slice(0, 8).map((t) => t.name).join(', ')}`,
    '',
    topic ? `## Tema específico solicitado\n${topic}` : '',
    pillarHint ? `## Pilar de contenido sugerido\n${pillarHint}` : '',
    '',
    'Generá 5 ideas de video viral. Variá los formatos y emociones entre las ideas.',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callClaude({
    model: MODELS.default,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    tools: [GENERATE_IDEAS_TOOL],
    maxTokens: 2048,
  });

  if (result.toolInput === undefined) {
    throw new Error('[idea-generator] No tool_use block in response');
  }

  return IdeasOutputSchema.parse(result.toolInput);
}
