#!/usr/bin/env tsx
/**
 * CLI smoke test for the idea generator.
 * Usage: ANTHROPIC_API_KEY=sk-... tsx packages/shared/scripts/try-idea-gen.ts
 */
import { generateIdeas } from '../src/ai/prompts/idea-generator.js';
import type { ProjectPatterns, ProjectBrand } from '../src/viral/types.js';

const mockPatterns: ProjectPatterns = {
  projectId: 'test-project',
  hooks: [
    {
      id: 'h1',
      text: 'Lo que nadie te dice sobre hacer contenido viral',
      type: 'curiosity_gap',
      estimatedEngagement: 'high',
      bestPlatforms: ['reels', 'tiktok'],
      exampleTopics: ['marketing digital', 'redes sociales'],
      language: 'es-AR',
    },
    {
      id: 'h2',
      text: '¿Todavía usás esta estrategia? Estás perdiendo plata',
      type: 'shame_relief',
      estimatedEngagement: 'viral',
      bestPlatforms: ['reels', 'tiktok', 'shorts'],
      exampleTopics: ['ads', 'marketing'],
      language: 'es-AR',
    },
  ],
  formats: [
    {
      id: 'f1',
      name: 'Tip rápido',
      description: 'Un solo consejo accionable en 30s',
      optimalDurationSec: { min: 20, max: 35 },
      bestPlatforms: ['reels', 'tiktok'],
      structureSegments: ['hook', 'setup', 'tip', 'cta'],
    },
  ],
  topics: [
    {
      id: 't1',
      name: 'Marketing digital con IA',
      category: 'marketing',
      dominantEmotion: 'curiosity_gap',
      productionDifficulty: 2,
      relatedHookIds: ['h1'],
    },
    {
      id: 't2',
      name: 'Cómo conseguir clientes sin pagar ads',
      category: 'ventas',
      dominantEmotion: 'immediate_value',
      productionDifficulty: 1,
      relatedHookIds: ['h2'],
    },
  ],
  pacing: {
    audioSpeedMultiplier: { min: 1.1, max: 1.3 },
    cutEverySec: { min: 2, max: 4 },
    ideaDensitySec: 3,
    musicBpm: { min: 120, max: 140 },
    voiceLufs: -14,
    musicLufs: -20,
    duckingDb: -12,
  },
  visualElements: [],
  ctaTemplates: ['Guardalo para después', 'Seguime para más', 'Comentá tu experiencia'],
  hashtags: {
    reels: ['marketingdigital', 'contenidoviral', 'estrategiadigital'],
    tiktok: ['marketing', 'viral', 'tips'],
    shorts: ['Shorts', 'marketing'],
  },
  captionTemplates: {},
  language: 'es-AR',
  parsedAt: new Date().toISOString(),
};

const mockBrand: ProjectBrand = {
  projectId: 'test-project',
  brandName: 'MarketingPro AR',
  oneLiner: 'Ayudamos a emprendedores argentinos a crecer con contenido viral sin perder tiempo',
  audience: {
    who: 'Emprendedores y freelancers argentinos 25-40 años',
    where: 'Instagram, TikTok, YouTube Shorts',
    pains: [
      'No sé qué contenido publicar',
      'Publico pero no consigo clientes',
      'No tengo tiempo para crear contenido todos los días',
    ],
  },
  valueProps: [
    'Ideas de contenido viral en minutos',
    'Scripts listos para grabar',
    'Estrategia basada en datos, no en intuición',
  ],
  features: ['Generador de ideas con IA', 'Scripts automatizados', 'Captions optimizados por plataforma'],
  caseStudies: [
    { title: 'Agencia de marketing duplicó sus seguidores en 30 días', metric: '+127% alcance orgánico' },
  ],
  voiceTone: 'Directo, sin rodeos, con humor ocasional. Voz de par a par, no de gurú.',
  ctas: [
    { kind: 'follow', value: 'Seguime para más tips así' },
    { kind: 'save', value: 'Guardalo para cuando lo necesités' },
    { kind: 'comment', value: 'Comentá si te pasó esto' },
  ],
  doNotSay: ['guru', 'fórmula secreta', 'hacete rico', 'método infalible'],
  parsedAt: new Date().toISOString(),
};

async function main() {
  console.log('🚀 Generando ideas de video viral...\n');

  const result = await generateIdeas({
    patterns: mockPatterns,
    brand: mockBrand,
    topic: 'Cómo usar IA para crear contenido en menos de 1 hora por semana',
  });

  console.log(`✅ ${result.ideas.length} ideas generadas:\n`);
  result.ideas.forEach((idea, i) => {
    console.log(`--- Idea ${i + 1} ---`);
    console.log(`Hook:     "${idea.hook}"`);
    console.log(`Formato:  ${idea.format} | ${idea.estimatedDurationSec}s | ${idea.riskLevel}`);
    console.log(`Emoción:  ${idea.targetEmotion}`);
    console.log(`Ángulo:   ${idea.angle}`);
    console.log(`Rationale: ${idea.rationale}`);
    console.log();
  });
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
