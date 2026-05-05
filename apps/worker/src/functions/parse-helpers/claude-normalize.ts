import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MODELS, resolveModelId } from '@virus/shared/ai';
import type { ProjectPatterns, ProjectBrand } from '@virus/shared/viral';
import { parser } from '@virus/shared/viral';

const { ProjectPatternsSchema, ProjectBrandSchema } = parser;
import type { ProjectFileKind } from '../../events/project-events.js';

/**
 * Claude-based fallback normalizer.
 *
 * Used when the deterministic parser fails or returns a partial result. We
 * pass the raw extracted text + the partial parse + the JSON-Schema-equivalent
 * description of the target Zod schema, then ask Claude Sonnet 4.6 to emit a
 * single JSON object that we re-validate.
 *
 * Cache strategy: the system prompt (which contains the stable, large schema
 * description) is cached with `cache_control: { type: 'ephemeral' }`. The
 * dynamic per-file payload goes in the user message — it changes every call,
 * so caching it would just waste cache slots.
 */

export type NormalizeInput = {
  text: string;
  kind: ProjectFileKind;
  projectId: string;
  partial?: Partial<ProjectPatterns> | Partial<ProjectBrand> | undefined;
};

export type NormalizeResult =
  | { ok: true; data: ProjectPatterns | ProjectBrand }
  | { ok: false; error: string };

// ---------- System prompts (stable per kind — good cache candidates) ----------

const PATTERNS_SCHEMA_HINT = `JSON shape (TypeScript):
{
  projectId: string;
  hooks: Array<{
    id: string;
    text: string;
    textEnglish?: string;
    type: "curiosity_gap" | "shame_relief" | "shock_contrarian" | "immediate_value" | "fomo" | "identity_insider" | "speed_build_demo" | "storytelling";
    estimatedEngagement: "low" | "medium" | "high" | "viral";
    bestPlatforms: Array<"reels" | "tiktok" | "shorts">;
    exampleTopics: string[];
    notes?: string;
    language: string;
  }>;
  formats: Array<{
    id: string;
    name: string;
    description: string;
    optimalDurationSec: { min: number; max: number };
    bestPlatforms: Array<"reels" | "tiktok" | "shorts">;
    realExample?: string;
    structureSegments: string[];
  }>;
  topics: Array<{
    id: string;
    name: string;
    category: string;
    dominantEmotion: string;
    productionDifficulty: 1 | 2 | 3 | 4 | 5;
    trendingUntil?: string;
    relatedHookIds: string[];
  }>;
  pacing: {
    audioSpeedMultiplier: { min: number; max: number };
    cutEverySec: { min: number; max: number };
    ideaDensitySec: number;
    musicBpm: { min: number; max: number };
    voiceLufs: number;
    musicLufs: number;
    duckingDb: number;
  };
  visualElements: Array<{ name: string; retentionLift: number; notes?: string }>;
  ctaTemplates: string[];
  hashtags: { reels: string[]; tiktok: string[]; shorts: string[] };
  captionTemplates: Record<string, string>;
  language: string;
  parsedAt: string;  // ISO-8601 UTC timestamp
  rawSource?: string;
}`;

const BRAND_SCHEMA_HINT = `JSON shape (TypeScript):
{
  projectId: string;
  brandName: string;
  oneLiner: string;
  audience: { who: string; where: string; pains: string[] };
  valueProps: string[];
  features: string[];
  caseStudies: Array<{ title: string; metric: string }>;
  voiceTone: string;
  ctas: Array<{ kind: string; value: string }>;
  doNotSay: string[];
  parsedAt: string;  // ISO-8601 UTC timestamp
}`;

function buildSystemPrompt(kind: ProjectFileKind): string {
  const schemaHint = kind === 'viral_patterns' ? PATTERNS_SCHEMA_HINT : BRAND_SCHEMA_HINT;
  return `You convert messy creator-project notes into a single strict JSON object.

Rules:
- Output ONLY valid JSON. No markdown fences, no commentary, no leading/trailing text.
- Match the target shape EXACTLY (no extra top-level keys).
- If a field is missing in the input, infer a reasonable default. Defaults must be type-correct (empty array, empty string, plausible number).
- If you infer a field, you MAY add a sibling key \`_inferred: true\` next to that field's parent object — but ONLY at object level, never inside the typed primitives. If unsure, omit it.
- If the input contradicts itself, prefer the more specific / more recent statement.
- Preserve the source language for textual fields.
- \`parsedAt\` MUST be an ISO-8601 UTC timestamp.

${schemaHint}`;
}

// ---------- Anthropic client (lazy + test-injectable) ----------

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  }
  return _client;
}

/** Test-only override. Pass `null` to restore the real client. */
export function __setAnthropicClientForNormalizeTests(client: Anthropic | null): void {
  _client = client;
}

// ---------- JSON parsing helper ----------

/**
 * Strip markdown code fences if Claude added them despite instructions, then
 * parse JSON. Returns the unknown payload or null on failure.
 */
function safeParseJson(raw: string): unknown {
  let trimmed = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch?.[1]) {
    trimmed = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to find the first {...} block as a fallback.
    const objMatch = /\{[\s\S]*\}/.exec(trimmed);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------- Main entrypoint ----------

export async function claudeNormalize(input: NormalizeInput): Promise<NormalizeResult> {
  const { text, kind, projectId, partial } = input;

  const system = buildSystemPrompt(kind);

  const userPayload =
    `projectId to use: ${projectId}\n\n` +
    `Raw extracted text:\n---\n${text}\n---\n\n` +
    (partial ? `Partial deterministic parse (use as a starting point, fill in gaps):\n${JSON.stringify(partial, null, 2)}\n\n` : '') +
    `Return the single JSON object matching the schema. Make sure projectId === "${projectId}".`;

  const client = getClient();

  let response;
  try {
    response = await client.messages.create({
      model: resolveModelId(MODELS.default),
      max_tokens: 8192,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPayload }],
    });
  } catch (err) {
    return {
      ok: false,
      error: `claude_call_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const textBlock = response.content.find((b) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;

  if (!textBlock?.text) {
    return { ok: false, error: 'claude_returned_empty_response' };
  }

  const parsed = safeParseJson(textBlock.text);
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'claude_output_not_valid_json' };
  }

  // Force projectId to the canonical value (don't trust the model here).
  (parsed as Record<string, unknown>)['projectId'] = projectId;

  const schema: z.ZodTypeAny =
    kind === 'viral_patterns' ? ProjectPatternsSchema : ProjectBrandSchema;
  const result = schema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.errors
      .slice(0, 5)
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return { ok: false, error: `zod_validation_failed: ${issues}` };
  }

  return { ok: true, data: result.data as ProjectPatterns | ProjectBrand };
}
