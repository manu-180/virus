import { z } from 'zod';

// ----------- Enums -----------

export const HookTypeSchema = z.enum([
  'curiosity_gap',
  'shame_relief',
  'shock_contrarian',
  'immediate_value',
  'fomo',
  'identity_insider',
  'speed_build_demo',
  'storytelling',
]);

export const HookEngagementSchema = z.enum(['low', 'medium', 'high', 'viral']);

export const HookPlatformSchema = z.enum(['reels', 'tiktok', 'shorts']);

// ----------- ParsedHook -----------

export const ParsedHookSchema = z.object({
  id: z.string(),
  text: z.string(),
  textEnglish: z.string().optional(),
  type: HookTypeSchema,
  estimatedEngagement: HookEngagementSchema,
  bestPlatforms: z.array(HookPlatformSchema),
  exampleTopics: z.array(z.string()),
  notes: z.string().optional(),
  language: z.string(),
});

// ----------- ParsedFormat -----------

export const ParsedFormatSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  optimalDurationSec: z.object({ min: z.number(), max: z.number() }),
  bestPlatforms: z.array(HookPlatformSchema),
  realExample: z.string().optional(),
  structureSegments: z.array(z.string()),
});

// ----------- PacingRules -----------

export const PacingRulesSchema = z.object({
  audioSpeedMultiplier: z.object({ min: z.number(), max: z.number() }),
  cutEverySec: z.object({ min: z.number(), max: z.number() }),
  ideaDensitySec: z.number(),
  musicBpm: z.object({ min: z.number(), max: z.number() }),
  voiceLufs: z.number(),
  musicLufs: z.number(),
  duckingDb: z.number(),
});

// ----------- VisualElement -----------

export const VisualElementSchema = z.object({
  name: z.string(),
  retentionLift: z.number(),
  notes: z.string().optional(),
});

// ----------- ParsedTopic -----------

export const ProductionDifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const ParsedTopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  dominantEmotion: z.string(),
  productionDifficulty: ProductionDifficultySchema,
  trendingUntil: z.string().optional(),
  relatedHookIds: z.array(z.string()),
});

// ----------- HashtagSet -----------

export const HashtagSetSchema = z.object({
  reels: z.array(z.string()),
  tiktok: z.array(z.string()),
  shorts: z.array(z.string()),
});

// ----------- ProjectPatterns -----------

export const ProjectPatternsSchema = z.object({
  projectId: z.string(),
  hooks: z.array(ParsedHookSchema),
  formats: z.array(ParsedFormatSchema),
  topics: z.array(ParsedTopicSchema),
  pacing: PacingRulesSchema,
  visualElements: z.array(VisualElementSchema),
  ctaTemplates: z.array(z.string()),
  hashtags: HashtagSetSchema,
  captionTemplates: z.record(z.string(), z.string()),
  language: z.string(),
  parsedAt: z.string(),
  rawSource: z.string().optional(),
});

export const ProjectPatternsPartialSchema = ProjectPatternsSchema.partial();

// ----------- ProjectBrand -----------

export const ProjectBrandSchema = z.object({
  projectId: z.string(),
  brandName: z.string(),
  oneLiner: z.string(),
  audience: z.object({
    who: z.string(),
    where: z.string(),
    pains: z.array(z.string()),
  }),
  valueProps: z.array(z.string()),
  features: z.array(z.string()),
  caseStudies: z.array(z.object({ title: z.string(), metric: z.string() })),
  voiceTone: z.string(),
  ctas: z.array(z.object({ kind: z.string(), value: z.string() })),
  doNotSay: z.array(z.string()),
  parsedAt: z.string(),
});

export const ProjectBrandPartialSchema = ProjectBrandSchema.partial();
