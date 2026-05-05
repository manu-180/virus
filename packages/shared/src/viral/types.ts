// ----------- HOOKS -----------
export type HookType =
  | 'curiosity_gap'
  | 'shame_relief'
  | 'shock_contrarian'
  | 'immediate_value'
  | 'fomo'
  | 'identity_insider'
  | 'speed_build_demo'
  | 'storytelling';

export type HookEngagement = 'low' | 'medium' | 'high' | 'viral';
export type HookPlatform = 'reels' | 'tiktok' | 'shorts';

export interface ParsedHook {
  id: string;
  text: string;
  textEnglish?: string;
  type: HookType;
  estimatedEngagement: HookEngagement;
  bestPlatforms: HookPlatform[];
  exampleTopics: string[];
  notes?: string;
  language: string;
}

// ----------- FORMATS -----------
export interface ParsedFormat {
  id: string;
  name: string;
  description: string;
  optimalDurationSec: { min: number; max: number };
  bestPlatforms: HookPlatform[];
  realExample?: string;
  structureSegments: string[];
}

// ----------- PACING -----------
export interface PacingRules {
  audioSpeedMultiplier: { min: number; max: number };
  cutEverySec: { min: number; max: number };
  ideaDensitySec: number;
  musicBpm: { min: number; max: number };
  voiceLufs: number;
  musicLufs: number;
  duckingDb: number;
}

// ----------- VISUAL ELEMENTS -----------
export interface VisualElement {
  name: string;
  retentionLift: number;
  notes?: string;
}

// ----------- CAPTIONS / HASHTAGS -----------
export type CaptionTemplate =
  | 'single_tip'
  | 'hot_take'
  | 'speed_build'
  | 'listicle'
  | 'story_horror'
  | 'product_demo'
  | (string & {});

export interface CaptionStructure {
  hook: string;
  value: string;
  cta: string;
  hashtags: string[];
}

export type HashtagSet = Record<HookPlatform, string[]>;

// ----------- TOPIC -----------
export interface ParsedTopic {
  id: string;
  name: string;
  category: string;
  dominantEmotion: string;
  productionDifficulty: 1 | 2 | 3 | 4 | 5;
  trendingUntil?: string;
  relatedHookIds: string[];
}

// ----------- PROJECT PATTERNS -----------
export interface ProjectPatterns {
  projectId: string;
  hooks: ParsedHook[];
  formats: ParsedFormat[];
  topics: ParsedTopic[];
  pacing: PacingRules;
  visualElements: VisualElement[];
  ctaTemplates: string[];
  hashtags: HashtagSet;
  captionTemplates: Record<CaptionTemplate, string>;
  language: string;
  parsedAt: string;
  rawSource?: string;
}

// ----------- PROJECT BRAND -----------
export interface ProjectBrand {
  projectId: string;
  brandName: string;
  oneLiner: string;
  audience: { who: string; where: string; pains: string[] };
  valueProps: string[];
  features: string[];
  caseStudies: { title: string; metric: string }[];
  voiceTone: string;
  ctas: { kind: string; value: string }[];
  doNotSay: string[];
  parsedAt: string;
}

// ----------- VIDEO STRUCTURE -----------
export interface VideoSegment {
  startSec: number;
  endSec: number;
  role: 'hook' | 'setup' | 'development' | 'mini_payoff' | 'reveal' | 'cta';
  description: string;
}

// ----------- SUGGEST INPUT/OUTPUT -----------
export interface ContentSignature {
  hookHash: string;
  topicHash: string;
  angleHash: string;
}

export interface RecentSignature extends ContentSignature {
  usedAt: string;
}

export interface SuggestInput {
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  recentSignatures: RecentSignature[];
  windowDays?: number;
  preferredFormats?: string[];
  pillarHint?: string;
}

export interface SuggestOutput {
  hook: ParsedHook;
  topic: ParsedTopic;
  format: ParsedFormat;
  structure: VideoSegment[];
  signature: ContentSignature;
  rationale: string;
}
