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
  /**
   * Optional rich visual identity used by the carousel image prompt builder.
   * Populated from `project_brand.visual_style` JSONB. All fields optional —
   * missing values fall back to preset defaults.
   */
  visualStyle?: {
    defaultPreset?: 'minimal' | 'bold' | 'editorial';
    /** Headline/title text color — overrides preset.textColor in the overlay */
    textColor?: string;
    /** Body paragraph text color — overrides preset.bodyColor in the overlay */
    bodyColor?: string;
    /** Accent elements color (arrows, numbers, CTA badge) — overrides preset.accentColor */
    accentColor?: string;
    secondaryAccent?: string;
    /** Overlay background color — overrides preset.overlayColor */
    backgroundColor?: string;
    surfaceColor?: string;
    fontPreference?: string;
    vibe?: string;
    sampleImageUrls?: string[];

    /**
     * Per-brand image-generation profile. When present, drives the prompts and
     * the image-batch strategy. When absent, the system falls back to the
     * legacy character-anchored photographic flow (back-compat for brands that
     * haven't been migrated yet).
     *
     * The profile cleanly decouples THREE things that used to be hardcoded:
     *   1) MEDIUM     — photo vs 3D render vs flat illustration vs line art
     *   2) CONTINUITY — same character (anchor-chain) vs same world (world-anchor)
     *                   vs standalone (no continuity)
     *   3) SUBJECTS   — what each slide actually depicts, varied per role so
     *                   no two slides of one carousel show the same thing
     */
    imageProfile?: BrandImageProfile;
  };
}

/**
 * Per-brand image-generation profile. Lives inside `visualStyle.imageProfile`.
 *
 * Designed to be edited from a settings UI eventually, but for now is set via
 * SQL migration or seed file. Every brand the user works on (APEX, BotLode,
 * Oficios, Assistify, …) gets its own profile so the carousels look
 * distinctively on-brand rather than all converging on the same default.
 */
export interface BrandImageProfile {
  /**
   * Visual medium for every slide in the carousel. Pick ONE — mixing media
   * inside a single carousel breaks visual cohesion.
   *
   * - `photo`              — photographic editorial shots (people, places, things).
   *                          Suits personal brands, lifestyle, food, B2C trades.
   * - `illustration-3d`    — premium 3D renders (Apple WWDC / Linear / Vercel).
   *                          Suits tech-premium B2B SaaS, dev studios.
   * - `illustration-flat`  — flat vector / brand illustrations (Stripe / Notion).
   *                          Suits approachable B2B SaaS, productivity tools.
   * - `illustration-line`  — line-art / monoline diagrams (Stripe Docs / Vercel docs).
   *                          Suits technical documentation, educational content.
   * - `editorial-mixed`    — magazine-style mix: 1 hero photo bookend +
   *                          abstract illustrations for the body slides.
   */
  mode: 'photo' | 'illustration-3d' | 'illustration-flat' | 'illustration-line' | 'editorial-mixed';

  /**
   * Free-text technique description threaded directly into the Gemini prompt.
   * Be SPECIFIC — generic mood words don't move the model. Mention rendering
   * engine references ("octane-style"), material qualities, lighting setup,
   * depth of field, etc. Example for APEX:
   * "premium 3D render in the style of Apple WWDC keynotes: matte materials,
   *  dramatic edge lighting in cyan + indigo, deep navy near-black background,
   *  shallow DOF, octane-style rendering, micro-bokeh highlights"
   */
  technique: string;

  /**
   * How slides relate to each other visually:
   *
   * - `world-anchor` (RECOMMENDED for tech/SaaS) — NO image-to-image chaining.
   *   Each slide is generated independently with a strong text prompt that
   *   anchors palette + lighting + technique. Continuity comes from the SAME
   *   VISUAL WORLD, not from a fixed character. Each slide depicts a
   *   different subject, so no two slides look alike. This is the strategy
   *   that fixes the "8 photos of the same guy at a laptop" problem.
   *
   * - `character-anchor` (legacy, default fallback) — slide 0 generates first
   *   alone, its image bytes become the reference image for slides 1..N.
   *   Produces "same person, different angles" output. Good for personal
   *   brands where storytelling follows one protagonist.
   *
   * - `standalone` — each slide independent, no continuity enforced beyond
   *   palette. Use for non-narrative carousels (e.g., catalog grids).
   */
  subjectStrategy: 'world-anchor' | 'character-anchor' | 'standalone';

  /**
   * Composition rules applied to every slide. Lighting, framing, negative
   * space, depth of field. Example:
   * "single hero subject centered, 40%+ negative space in the lower half for
   *  overlay text, single primary light from upper-left at 45°, secondary
   *  cyan rim-light from behind, shallow depth of field with creamy bokeh"
   */
  composition: string;

  /**
   * Mood/atmosphere keywords joined into the prompt. Short list (5–10).
   * Example: ["cinematic", "premium", "moody", "tech-forward", "minimalist"]
   */
  moodKeywords: string[];

  /**
   * Hard "do-not-include" rules. Threaded into the Gemini prompt's negative
   * section. The SINGLE biggest lever for fixing "every slide has a person":
   * set `"no humans"` here. Other useful ones: "no text", "no logos",
   * "no stock-photo look", "no clip-art".
   */
  negativeVisuals: string[];

  /**
   * Per-role scene archetypes. Each role lists 3–6 DIFFERENT subject ideas
   * in ENGLISH (for the downstream image model). Claude reads this list when
   * planning slides and writes ONE distinct visualPrompt per slide drawn from
   * the role's pool — never reusing a subject within the same carousel.
   *
   * Without this, Claude defaults to its generic "person at desk" suggestion
   * and every slide ends up showing the same thing.
   */
  subjectLibrary?: {
    hook?: string[];
    problem?: string[];
    insight?: string[];
    data?: string[];
    example?: string[];
    cta?: string[];
  };
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
