import { z } from 'zod';

// ---------------------------------------------------------------------------
// Asset enums (Zod + TS)
// ---------------------------------------------------------------------------

export const AssetCategorySchema = z.enum(['hook', 'reveal', 'cta']);
export type AssetCategory = z.infer<typeof AssetCategorySchema>;

export const AssetTypeSchema = z.enum(['video', 'image']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetProviderSchema = z.enum(['luma', 'gemini', 'fal']);
export type AssetProvider = z.infer<typeof AssetProviderSchema>;

export const AssetStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

// ---------------------------------------------------------------------------
// asset_choices (persisted on video_ideas.metadata.asset_choices)
// Validated on both ends: web write + worker read.
// ---------------------------------------------------------------------------

export const AssetChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fresh') }),
  z.object({ mode: z.literal('reuse') }),
  z.object({ mode: z.literal('manual'), assetId: z.string().uuid() }),
]);
export type AssetChoice = z.infer<typeof AssetChoiceSchema>;

export const AssetChoicesSchema = z.object({
  hook: AssetChoiceSchema.default({ mode: 'fresh' }),
  reveal: AssetChoiceSchema.default({ mode: 'fresh' }),
  cta: AssetChoiceSchema.default({ mode: 'fresh' }),
});
export type AssetChoices = z.infer<typeof AssetChoicesSchema>;

// ---------------------------------------------------------------------------
// Database row shape — mirrors `public.visual_assets` (migration 0014).
// ---------------------------------------------------------------------------

export interface VisualAssetRow {
  id: string;
  project_id: string;
  user_id: string;
  type: AssetType;
  category: AssetCategory;
  provider: AssetProvider;
  status: AssetStatus;
  prompt: string;
  prompt_hash: string;
  template: string;
  language: string;
  storage_path: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  theme_color: string;
  tags: string[];
  burned: boolean;
  last_used_at: string | null;
  error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Render-time props passed to Remotion templates.
// URLs are signed on-demand inside `render-video.ts`.
// ---------------------------------------------------------------------------

export interface AssetRef {
  url: string;
  type: AssetType;
  durationSec?: number;
}

export interface RenderAssets {
  hook?: AssetRef;
  reveal?: AssetRef;
  cta?: AssetRef;
}
