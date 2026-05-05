# Cinematic AI Visual Assets Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Luma Ray (b-roll video) + Gemini "Nano Banana" (hero image) generation step to the Virus pipeline so `tip` and `hot-take` templates render with cinematic backdrops behind hook/reveal/cta segments instead of flat black.

**Architecture:** New Inngest step `generate-visual-assets` runs after `script.generated` and emits `assets.generated`. `synthesize-audio` listens to the new event. Generated assets are cached in a new `visual_assets` table keyed by prompt hash; URLs are signed on-demand at render time. Remotion templates accept an optional `assets` prop and layer `<AIBackgroundVideo>`/`<AIHeroImage>` components behind existing UI. Feature-flagged with `ASSETS_ENABLED` (default false in prod).

**Tech Stack:**
- Backend: Inngest, Supabase (Postgres + Storage + RLS), TypeScript Node.js
- Providers: `@google/genai` (Gemini 2.5 Flash Image / Imagen 4), Luma `lumaai` SDK
- Frontend: Next.js 15, React 19, Tailwind, shadcn/ui
- Render: Remotion 4, AWS Lambda (existing), `<OffthreadVideo>`, `<Img>`
- Validation: Zod
- Tests: Vitest

**Spec:** [`../specs/2026-05-05-cinematic-ai-assets-pipeline-design.md`](../specs/2026-05-05-cinematic-ai-assets-pipeline-design.md)

**Estimated total effort:** 8 phases, ~30 tasks. Solo execution: 2-3 days. Subagent-driven: ~1 day.

---

## File Structure (decomposition lock-in)

### Created (~30 files)

**Migrations** (`packages/db/migrations/`)
- `0014_visual_assets.sql` — tables `visual_assets` + `video_assets_used` + RLS + triggers
- `0015_visual_assets_bucket.sql` — Supabase Storage bucket `visual-assets`
- `0016_usage_records_extend.sql` — extend `usage_records.service` CHECK constraint to include `luma`, `gemini`, `fal`
- `0017_assets_alert_rpc.sql` — RPC `compute_assets_failure_rate(window_minutes int)` for monitoring

**Shared package** (`packages/shared/src/visuals/`)
- `types.ts` — domain types + Zod schemas (`AssetCategory`, `AssetMode`, `AssetChoicesSchema`, `VisualAssetRow`)
- `prompts/build.ts` — `buildPrompts(script, themeColor, brand, language, template) → { hook, reveal, cta }`
- `prompts/style.ts` — fixed "Cinematic Dev Noir" descriptors (camera/light/color/subjects/negative)
- `prompts/__tests__/build.test.ts`
- `providers/luma.ts` — `generateVideo(prompt, durationSec, themeColor)` wrapper
- `providers/gemini.ts` — `generateImage(prompt, themeColor)` wrapper
- `providers/index.ts` — provider router
- `cache/lookup.ts` — `findCachedAsset(supabase, projectId, promptHash)` + `claimRow`
- `cache/__tests__/lookup.test.ts`
- `hash.ts` — `computePromptHash({prompt, themeColor, provider, template, language})`
- `index.ts` — re-exports

**Worker function** (`apps/worker/src/functions/`)
- `generate-visual-assets.ts` — Inngest function, the orchestration core
- `monitor-assets-failure-rate.ts` — Inngest scheduled function (every 15min)
- `__tests__/generate-visual-assets.test.ts`

**Inngest events** (`packages/inngest/src/`)
- Modify `client.ts` — add `assets.generated`, `assets.skipped`, `assets.failed` events

**Remotion components** (`packages/remotion/src/components/`)
- `AssetBackdrop.tsx` — slot-aware wrapper
- `AIBackgroundVideo.tsx` — video with tint + Ken Burns + error boundary
- `AIHeroImage.tsx` — image with parallax + glow + error boundary
- `AssetErrorBoundary.tsx` — Remotion-compatible boundary returning null

**Web pages + APIs** (`apps/web/src/app/`)
- `(dashboard)/dashboard/assets/page.tsx` — library list page (server component)
- `(dashboard)/dashboard/assets/_components/assets-grid.tsx` — client component
- `(dashboard)/dashboard/ideas/_components/asset-choices-form.tsx` — 3 dropdowns
- `api/assets/route.ts` — GET list
- `api/assets/[id]/route.ts` — DELETE (mark burned), PATCH (tags)
- `api/assets/[id]/regenerate/route.ts` — POST (enqueue regen)

### Modified (~10 files)

- `packages/inngest/src/client.ts` (new event types)
- `apps/worker/src/functions/generate-script.ts` (emit conditional event)
- `apps/worker/src/functions/synthesize-audio.ts` (subscribe to assets.generated + assets.skipped)
- `apps/worker/src/functions/render-video.ts` (resolve asset URLs + HEAD precheck + pass to RenderInputProps)
- `apps/worker/src/functions/index.ts` (register new functions)
- `packages/remotion/src/templates/tip/index.tsx` (use AssetBackdrop)
- `packages/remotion/src/templates/tip/schema.ts` (add `assets` prop)
- `packages/remotion/src/templates/hot-take/index.tsx`
- `packages/remotion/src/templates/hot-take/schema.ts`
- `packages/shared/src/render/types.ts` (assets in RenderInputProps)
- `apps/web/src/app/(dashboard)/dashboard/ideas/_components/ideas-client.tsx` (insert asset-choices-form into approve flow)
- `apps/web/src/app/api/ideas/[id]/approve/route.ts` (persist asset_choices)
- `apps/web/src/app/api/ideas/test-seed/route.ts` (default asset_choices)
- `apps/web/src/components/dashboard/sidebar.tsx` (add "Biblioteca" link if not there)
- `.env.example` (already done)

---

## Execution Strategy

Execute in **phase order**. Within a phase, tasks can be parallelized when files don't overlap. Each task ends with a commit.

**Pre-flight: this repo is not a git repo.** Initialize before starting Phase 1: `git init && git add -A && git commit -m "chore: baseline before assets pipeline"`. All tasks below assume git is initialized.

---

## Phase 1 — Database foundations

### Task 1.1: Migration 0014 — visual_assets table

**Files:** Create `packages/db/migrations/0014_visual_assets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 0014: Visual assets pipeline (Luma + Gemini b-roll/imagery)
-- ============================================================

CREATE TABLE public.visual_assets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('video', 'image')),
  category     text        NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  provider     text        NOT NULL CHECK (provider IN ('luma', 'gemini', 'fal')),
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'ready', 'failed')),
  prompt       text        NOT NULL,
  prompt_hash  text        NOT NULL,
  template     text        NOT NULL,
  language     text        NOT NULL,
  storage_path text,
  duration_sec numeric,
  width        int,
  height       int,
  theme_color  text        NOT NULL,
  tags         text[]      NOT NULL DEFAULT '{}',
  burned       boolean     NOT NULL DEFAULT false,
  last_used_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, prompt_hash)
);

CREATE INDEX visual_assets_project_category_idx
  ON public.visual_assets (project_id, category)
  WHERE burned = false AND status = 'ready';

CREATE INDEX visual_assets_last_used_idx
  ON public.visual_assets (project_id, last_used_at DESC NULLS FIRST);

-- copy user_id from project on insert
CREATE TRIGGER copy_user_id_visual_assets
  BEFORE INSERT ON public.visual_assets
  FOR EACH ROW EXECUTE FUNCTION set_project_user_id();

-- ============================================================
-- video_assets_used (link table)
-- ============================================================

CREATE TABLE public.video_assets_used (
  video_id  uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id  uuid NOT NULL REFERENCES public.visual_assets(id) ON DELETE RESTRICT,
  category  text NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  used_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, category)
);

CREATE INDEX video_assets_used_asset_idx ON public.video_assets_used (asset_id);

-- copy user_id from videos via video_id
CREATE OR REPLACE FUNCTION set_video_assets_used_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM public.videos WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER copy_user_id_video_assets_used
  BEFORE INSERT ON public.video_assets_used
  FOR EACH ROW EXECUTE FUNCTION set_video_assets_used_user_id();

-- update last_used_at on link insert
CREATE OR REPLACE FUNCTION touch_visual_asset_last_used()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.visual_assets SET last_used_at = NOW() WHERE id = NEW.asset_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_last_used_on_link
  AFTER INSERT ON public.video_assets_used
  FOR EACH ROW EXECUTE FUNCTION touch_visual_asset_last_used();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.visual_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets_used ENABLE ROW LEVEL SECURITY;

CREATE POLICY visual_assets_owner ON public.visual_assets
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY video_assets_used_owner ON public.video_assets_used
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__supabase-conductor__apply_migration` tool with name `0014_visual_assets` and the SQL above. (If the project uses local Supabase: `supabase db push` instead.)

- [ ] **Step 3: Verify schema**

Use `mcp__supabase-conductor__list_tables` and confirm `visual_assets` and `video_assets_used` exist with the columns listed.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0014_visual_assets.sql
git commit -m "feat(db): visual_assets + video_assets_used tables for cinematic pipeline"
```

### Task 1.2: Migration 0015 — Storage bucket

**Files:** Create `packages/db/migrations/0015_visual_assets_bucket.sql`

- [ ] **Step 1: Write the migration**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('visual-assets', 'visual-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Path layout: <user_id>/<project_id>/<asset_id>.<ext>
-- RLS: only owner can read/write their files

CREATE POLICY "visual_assets_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "visual_assets_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "visual_assets_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'visual-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply** via Supabase MCP.
- [ ] **Step 3: Verify** — try uploading a test file via Supabase dashboard with a service role key; confirm path scoping.
- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0015_visual_assets_bucket.sql
git commit -m "feat(db): visual-assets storage bucket with owner RLS"
```

### Task 1.3: Migration 0016 — Extend usage_records

**Files:** Create `packages/db/migrations/0016_usage_records_extend.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE public.usage_records
  DROP CONSTRAINT usage_records_service_check;

ALTER TABLE public.usage_records
  ADD CONSTRAINT usage_records_service_check
  CHECK (service IN ('anthropic','elevenlabs','assemblyai','remotion_lambda','luma','gemini','fal'));

-- Helper: 24h spend by user across visual providers
CREATE OR REPLACE FUNCTION sum_visual_spend_last_24h_user(p_user_id uuid)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.usage_records
  WHERE user_id = p_user_id
    AND service IN ('luma','gemini','fal')
    AND created_at > now() - INTERVAL '24 hours';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION sum_visual_spend_last_24h_global()
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.usage_records
  WHERE service IN ('luma','gemini','fal')
    AND created_at > now() - INTERVAL '24 hours';
$$ LANGUAGE SQL STABLE;
```

- [ ] **Step 2: Apply** via Supabase MCP.
- [ ] **Step 3: Test the RPC**

```sql
SELECT sum_visual_spend_last_24h_user('00000000-0000-0000-0000-000000000000'::uuid);
-- Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0016_usage_records_extend.sql
git commit -m "feat(db): extend usage_records for visual providers + spend RPCs"
```

### Task 1.4: Migration 0017 — Failure-rate RPC

**Files:** Create `packages/db/migrations/0017_assets_alert_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE OR REPLACE FUNCTION compute_assets_failure_rate(window_minutes int DEFAULT 60)
RETURNS TABLE(total int, failed int, rate numeric) AS $$
  WITH evts AS (
    SELECT step
    FROM public.job_events
    WHERE created_at > now() - (window_minutes || ' minutes')::interval
      AND step IN ('assets.generated', 'assets.failed')
  )
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE step = 'assets.failed')::int AS failed,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND((COUNT(*) FILTER (WHERE step = 'assets.failed'))::numeric / COUNT(*), 4)
    END AS rate
  FROM evts;
$$ LANGUAGE SQL STABLE;
```

- [ ] **Step 2: Apply + Test + Commit**

```bash
git add packages/db/migrations/0017_assets_alert_rpc.sql
git commit -m "feat(db): assets failure-rate RPC for monitoring"
```

### Task 1.5: Regenerate TypeScript types

- [ ] Run `mcp__supabase-conductor__generate_typescript_types` and write the output to `packages/db/src/database.types.ts` (or wherever the project stores them — check `packages/db/src/`).
- [ ] Commit: `chore(db): regenerate types after assets migrations`

---

## Phase 2 — Shared package: types, hashing, prompts

### Task 2.1: Domain types + Zod schemas

**Files:** Create `packages/shared/src/visuals/types.ts`

- [ ] Implement (full file):

```ts
import { z } from 'zod';

export const AssetCategory = z.enum(['hook', 'reveal', 'cta']);
export type AssetCategory = z.infer<typeof AssetCategory>;

export const AssetType = z.enum(['video', 'image']);
export type AssetType = z.infer<typeof AssetType>;

export const AssetProvider = z.enum(['luma', 'gemini', 'fal']);
export type AssetProvider = z.infer<typeof AssetProvider>;

export const AssetStatus = z.enum(['pending', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatus>;

// asset_choices persisted on video_ideas.metadata
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

// passed to Remotion templates
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
```

- [ ] Commit: `feat(shared/visuals): types + Zod schemas`

### Task 2.2: Prompt hash function

**Files:** Create `packages/shared/src/visuals/hash.ts`

- [ ] Implement:

```ts
/**
 * Deterministic prompt hash. Includes everything that influences the visual
 * output so cache hits are correct. Uses Web Crypto so it runs in Edge runtime.
 */
export async function computePromptHash(input: {
  prompt: string;
  themeColor: string;
  provider: 'luma' | 'gemini' | 'fal';
  template: string;
  language: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    p: input.prompt.trim(),
    c: input.themeColor.toLowerCase(),
    pr: input.provider,
    t: input.template,
    l: input.language,
  });
  const data = new TextEncoder().encode(canonical);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
```

- [ ] **Test:** Create `packages/shared/src/visuals/__tests__/hash.test.ts` with deterministic input, verify same output across runs and changes when any input changes.
- [ ] Commit: `feat(shared/visuals): deterministic prompt hashing`

### Task 2.3: Style descriptors (Cinematic Dev Noir)

**Files:** Create `packages/shared/src/visuals/prompts/style.ts`

- [ ] Implement:

```ts
/**
 * Fixed style descriptors injected into every prompt. Keeps videos visually
 * consistent across all generations.
 */

export const STYLE_NAME = 'cinematic-dev-noir';

export const CAMERA_DESCRIPTORS = [
  'shallow depth of field',
  'anamorphic feel',
  'slow dolly-in',
  'cinematic framing',
  '35mm equivalent',
];

export const LIGHTING_DESCRIPTORS = [
  'dim ambient lighting',
  'volumetric light shafts',
  'dust particles in the air',
  'high contrast',
  'moody chiaroscuro',
];

export const SUBJECT_POOL_HOOK = [
  'developer terminal with green code on a dark monitor',
  'rgb mechanical keyboard close-up in dim light',
  'multiple ultrawide monitors in a dark room',
  'hands typing on a backlit keyboard',
  'fiber optic cables glowing',
  'cpu and circuit board macro shot',
];

export const SUBJECT_POOL_CTA = [
  'a single monitor displaying a clean dashboard',
  'developer hands closing a laptop',
  'a glowing notification on a dark screen',
  'fingers tapping a smartphone in low light',
];

export const REVEAL_COMPOSITIONS = [
  'product photography style hero shot',
  'apple keynote style product reveal',
  'minimalist composition with strong directional light',
  'one object centered with negative space',
];

export const NEGATIVE_PROMPT = [
  'matrix code rain',
  'glitch effect',
  'fake hacker aesthetic',
  'wide angle of person at desk',
  'deformed hands',
  'extra fingers',
  'text artifacts',
  'oversaturated colors',
  'cartoon',
  'anime',
].join(', ');

export function pickRandom<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}
```

- [ ] Commit: `feat(shared/visuals): cinematic-dev-noir style descriptors`

### Task 2.4: Prompt builder

**Files:** Create `packages/shared/src/visuals/prompts/build.ts`

- [ ] Implement: takes script segments + theme + brand and builds 3 deterministic prompts (one per slot). The builder must:
  - Accept a `seed` (e.g. `videoId.hashCode()`) so same video produces same prompts on retry.
  - For `hook`: pick from SUBJECT_POOL_HOOK + camera + lighting + theme color reference.
  - For `reveal`: pick from REVEAL_COMPOSITIONS, weave in the reveal segment text as the symbolic subject.
  - For `cta`: pick from SUBJECT_POOL_CTA + camera + lighting.
  - Always append `STYLE_NAME` as a tag and the negative prompt.
  - Output: `{ hook: string, reveal: string, cta: string }`.

```ts
import type { ScriptOutput } from '@virus/shared/ai';
import {
  CAMERA_DESCRIPTORS,
  LIGHTING_DESCRIPTORS,
  SUBJECT_POOL_HOOK,
  SUBJECT_POOL_CTA,
  REVEAL_COMPOSITIONS,
  NEGATIVE_PROMPT,
  pickRandom,
} from './style.js';

export interface BuildPromptsInput {
  script: ScriptOutput;
  themeColor: string;
  brandOneLiner?: string;
  language: string;
  template: string;
  seed: number;
}

export interface BuiltPrompts {
  hook: string;
  reveal: string;
  cta: string;
}

export function buildPrompts(input: BuildPromptsInput): BuiltPrompts {
  const { themeColor, seed } = input;
  const hookSubject = pickRandom(SUBJECT_POOL_HOOK, seed);
  const ctaSubject = pickRandom(SUBJECT_POOL_CTA, seed + 1);
  const revealComp = pickRandom(REVEAL_COMPOSITIONS, seed + 2);

  const camera = pickRandom(CAMERA_DESCRIPTORS, seed);
  const lighting = pickRandom(LIGHTING_DESCRIPTORS, seed + 1);

  const accent = `${themeColor} neon accent`;

  const revealSeg = input.script.segments.find((s) => s.role === 'reveal');
  const revealText = revealSeg?.onScreenText ?? revealSeg?.voiceover ?? 'a key insight';

  const base = `${camera}, ${lighting}, ${accent}, cinematic dev noir style. AVOID: ${NEGATIVE_PROMPT}.`;

  return {
    hook: `${hookSubject}, ${base}`,
    reveal: `${revealComp} symbolizing "${revealText.slice(0, 80)}", ${base}`,
    cta: `${ctaSubject}, ${base}`,
  };
}

export function seedFromVideoId(videoId: string): number {
  let h = 0;
  for (let i = 0; i < videoId.length; i++) {
    h = (h * 31 + videoId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
```

- [ ] **Test:** `packages/shared/src/visuals/prompts/__tests__/build.test.ts`
  - Same seed → same prompts (deterministic)
  - Different theme color → different prompts
  - All 3 prompts contain "cinematic dev noir"
  - Negative prompt always present
- [ ] Commit: `feat(shared/visuals): prompt builder for hook/reveal/cta`

### Task 2.5: Cache lookup + claim

**Files:** Create `packages/shared/src/visuals/cache/lookup.ts`

- [ ] Implement (full file):

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisualAssetRow, AssetCategory, AssetProvider } from '../types.js';

const STALE_CLAIM_MINUTES = 5;

/** Find a ready, non-burned asset by exact prompt hash. */
export async function findCachedAsset(
  db: SupabaseClient,
  projectId: string,
  promptHash: string,
): Promise<VisualAssetRow | null> {
  const { data, error } = await db
    .from('visual_assets')
    .select('*')
    .eq('project_id', projectId)
    .eq('prompt_hash', promptHash)
    .eq('status', 'ready')
    .eq('burned', false)
    .maybeSingle();
  if (error) throw error;
  return (data as VisualAssetRow) ?? null;
}

/** Find a reusable asset for the 'reuse' mode. */
export async function findReusableAsset(
  db: SupabaseClient,
  projectId: string,
  category: AssetCategory,
  themeColor: string,
  cooldownDays = 14,
): Promise<VisualAssetRow | null> {
  const cutoff = new Date(Date.now() - cooldownDays * 86400_000).toISOString();
  const { data, error } = await db
    .from('visual_assets')
    .select('*')
    .eq('project_id', projectId)
    .eq('category', category)
    .eq('theme_color', themeColor)
    .eq('status', 'ready')
    .eq('burned', false)
    .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as VisualAssetRow) ?? null;
}

export interface ClaimResult {
  assetId: string;
  status: 'ready' | 'pending';
  weOwnIt: boolean;
}

/**
 * Insert-or-claim a row. ON CONFLICT semantics:
 *  - If row exists with status=ready → return it, weOwnIt=false (use cache)
 *  - If row exists with status=pending and stale (>5min) → reclaim, weOwnIt=true
 *  - If row exists with status=pending and fresh → return it, weOwnIt=false (concurrent)
 *  - If no row → insert, weOwnIt=true
 */
export async function claimRow(
  db: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    type: 'video' | 'image';
    category: AssetCategory;
    provider: AssetProvider;
    prompt: string;
    promptHash: string;
    template: string;
    language: string;
    themeColor: string;
  },
): Promise<ClaimResult> {
  // Atomic upsert with conflict resolution. We use a CTE-style RPC for full atomicity.
  // Simpler approach: try insert, on duplicate read existing row.
  const { data: existing } = await db
    .from('visual_assets')
    .select('id, status, created_at')
    .eq('project_id', input.projectId)
    .eq('prompt_hash', input.promptHash)
    .maybeSingle();

  if (existing && existing.status === 'ready') {
    return { assetId: existing.id, status: 'ready', weOwnIt: false };
  }

  if (existing && existing.status === 'pending') {
    const ageMin = (Date.now() - new Date(existing.created_at).getTime()) / 60_000;
    if (ageMin > STALE_CLAIM_MINUTES) {
      // reclaim — reset created_at by updating the row, we own it
      await db
        .from('visual_assets')
        .update({ created_at: new Date().toISOString(), error: null })
        .eq('id', existing.id);
      return { assetId: existing.id, status: 'pending', weOwnIt: true };
    }
    return { assetId: existing.id, status: 'pending', weOwnIt: false };
  }

  const { data: inserted, error } = await db
    .from('visual_assets')
    .insert({
      project_id: input.projectId,
      user_id: input.userId, // trigger overrides anyway
      type: input.type,
      category: input.category,
      provider: input.provider,
      status: 'pending',
      prompt: input.prompt,
      prompt_hash: input.promptHash,
      template: input.template,
      language: input.language,
      theme_color: input.themeColor,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { assetId: inserted!.id, status: 'pending', weOwnIt: true };
}
```

- [ ] **Test:** `cache/__tests__/lookup.test.ts` with mocked Supabase client. Cover: cache hit, stale pending reclaim, fresh pending no-claim, fresh insert.
- [ ] Commit: `feat(shared/visuals): cache lookup + claim row primitive`

### Task 2.6: Index file

**Files:** Create `packages/shared/src/visuals/index.ts`

- [ ] `export * from './types.js'; export * from './hash.js'; export * from './prompts/build.js'; export * from './cache/lookup.js'; export * as providers from './providers/index.js';`
- [ ] Update `packages/shared/src/index.ts` to re-export `* as visuals from './visuals/index.js'`.
- [ ] Run `pnpm --filter @virus/shared typecheck` — must pass.
- [ ] Commit: `chore(shared): export visuals module`

---

## Phase 3 — Provider SDK wrappers

### Task 3.1: Install provider SDKs

- [ ] Run:

```bash
pnpm --filter @virus/shared add @google/genai lumaai
```

Versions: `@google/genai` ^0.4.0, `lumaai` ^1.0.0 or latest. Check actual published versions before pinning.

- [ ] Commit: `chore(deps): add @google/genai and lumaai SDKs`

### Task 3.2: Luma provider wrapper

**Files:** Create `packages/shared/src/visuals/providers/luma.ts`

- [ ] Implement (key shape — adapt to actual SDK):

```ts
import { LumaAI } from 'lumaai';

export interface LumaGenInput {
  prompt: string;
  durationSec: number;     // 5..10
  aspectRatio?: '9:16' | '1:1' | '16:9';
  themeColor: string;
}

export interface LumaGenOutput {
  bytes: Buffer;          // mp4
  durationSec: number;
  width: number;
  height: number;
  costUsd: number;
}

export async function generateVideoLuma(input: LumaGenInput): Promise<LumaGenOutput> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) throw new Error('LUMA_API_KEY not set');
  const client = new LumaAI({ authToken: apiKey });

  const generation = await client.generations.create({
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? '9:16',
    duration: `${input.durationSec}s` as `${number}s`,
    model: process.env.ASSETS_LUMA_MODEL ?? 'ray-2',
    resolution: '720p',
  });

  // Poll until complete
  let status = generation;
  const startedAt = Date.now();
  while (status.state !== 'completed' && status.state !== 'failed') {
    if (Date.now() - startedAt > 120_000) throw new Error('luma_timeout');
    await new Promise((r) => setTimeout(r, 5_000));
    status = await client.generations.get(generation.id);
  }
  if (status.state === 'failed') {
    throw new Error(`luma_failed: ${status.failure_reason ?? 'unknown'}`);
  }

  const videoUrl = status.assets?.video;
  if (!videoUrl) throw new Error('luma_no_video_url');

  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());

  return {
    bytes: buf,
    durationSec: input.durationSec,
    width: 720,
    height: 1280,
    costUsd: 0.06 * input.durationSec,  // 720p ray-2 estimate
  };
}
```

- [ ] **Manual integration test** (only if `LUMA_API_KEY` set): generate one 5s clip, save to `/tmp/luma-test.mp4`, eyeball quality. Add this as a smoke script in `packages/shared/src/visuals/providers/__smoke__/luma-smoke.ts` (not a unit test, run on demand).
- [ ] Commit: `feat(shared/visuals): luma provider wrapper`

### Task 3.3: Gemini provider wrapper

**Files:** Create `packages/shared/src/visuals/providers/gemini.ts`

- [ ] Implement:

```ts
import { GoogleGenAI } from '@google/genai';

export interface GeminiGenInput {
  prompt: string;
  themeColor: string;
  aspectRatio?: '9:16' | '1:1';
}

export interface GeminiGenOutput {
  bytes: Buffer;          // png or jpg
  width: number;
  height: number;
  costUsd: number;
}

export async function generateImageGemini(input: GeminiGenInput): Promise<GeminiGenOutput> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');
  const ai = new GoogleGenAI({ apiKey });

  const model = process.env.ASSETS_GEMINI_MODEL ?? 'imagen-4.0-generate-001';

  const result = await ai.models.generateImages({
    model,
    prompt: input.prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: input.aspectRatio ?? '9:16',
      personGeneration: 'allow_adult',
    },
  });

  const generated = result.generatedImages?.[0]?.image;
  if (!generated?.imageBytes) throw new Error('gemini_no_image');

  const buf = Buffer.from(generated.imageBytes, 'base64');
  return {
    bytes: buf,
    width: 1080,
    height: 1920,
    costUsd: 0.039,
  };
}
```

- [ ] **Smoke script:** `__smoke__/gemini-smoke.ts`
- [ ] Commit: `feat(shared/visuals): gemini provider wrapper`

### Task 3.4: Provider router

**Files:** Create `packages/shared/src/visuals/providers/index.ts`

- [ ] Implement:

```ts
export { generateVideoLuma } from './luma.js';
export { generateImageGemini } from './gemini.js';

import type { AssetCategory } from '../types.js';

export interface ProviderChoice {
  provider: 'luma' | 'gemini';
  type: 'video' | 'image';
}

/** Per-slot provider strategy (locked in spec). */
export function pickProvider(category: AssetCategory): ProviderChoice {
  switch (category) {
    case 'hook':   return { provider: 'luma',   type: 'video' };
    case 'reveal': return { provider: 'gemini', type: 'image' };
    case 'cta':    return { provider: 'luma',   type: 'video' };
  }
}

export function defaultDurationFor(category: AssetCategory): number {
  return category === 'cta' ? 5 : 6;
}
```

- [ ] Commit: `feat(shared/visuals): provider router`

---

## Phase 4 — Inngest pipeline integration

### Task 4.1: Register new events

**Files:** Modify `packages/inngest/src/client.ts`

- [ ] Add to the `Events` type:

```ts
'virus/assets.requested': { data: { videoId: string } };
'virus/assets.generated': { data: {
  videoId: string;
  assetIds: { hook: string | null; reveal: string | null; cta: string | null };
}};
'virus/assets.skipped':   { data: { videoId: string; reason: string } };
'virus/assets.failed':    { data: { videoId: string; slot: 'hook'|'reveal'|'cta'; reason: string } };
```

- [ ] Run `pnpm --filter @virus/inngest typecheck`.
- [ ] Commit: `feat(inngest): assets pipeline events`

### Task 4.2: `generate-visual-assets` function

**Files:** Create `apps/worker/src/functions/generate-visual-assets.ts`

- [ ] Implement skeleton that follows the spec's Flow exactly. Key constraints to enforce in code review:
  - Each external call (`call-provider-<slot>`, `upload-storage-<slot>`, `finalize-row-<slot>`, `log-spend-<slot>`) is a separate `step.run()`.
  - Spend cap check uses the RPCs `sum_visual_spend_last_24h_user` and `sum_visual_spend_last_24h_global`.
  - Asset choices read via `AssetChoicesSchema.parse()` — invalid → fall back to all-fresh.
  - On any error in a slot: record asset_id = null for that slot, emit `virus/assets.failed`, continue with other slots.
  - At the end ALWAYS emit `virus/assets.generated` (even if all 3 slots NULL) so audio fires.
  - `onFailure` handler emits `virus/assets.generated` with all-NULL.
- [ ] **Test:** `__tests__/generate-visual-assets.test.ts` covers: all-fresh happy path, cache hit, stale pending reclaim, spend cap reached, provider 5xx with 1 retry then fallback, broken Zod choice falls to default.
- [ ] Commit: `feat(worker): generate-visual-assets Inngest function`

### Task 4.3: Modify `generate-script.ts`

**Files:** Modify `apps/worker/src/functions/generate-script.ts`

- [ ] Find the `step.sendEvent` call at the end.
- [ ] Replace with conditional emission:

```ts
const assetsEnabled = process.env.ASSETS_ENABLED === 'true';
await step.sendEvent('next', {
  name: assetsEnabled ? 'virus/script.generated' : 'virus/assets.skipped',
  data: assetsEnabled
    ? { videoId }
    : { videoId, reason: 'feature_disabled' },
});
```

NOTE: `script.generated` already triggers `generate-visual-assets`. When the flag is off, we emit `assets.skipped` directly so synthesize-audio fires.

- [ ] Commit: `feat(worker): generate-script emits assets.skipped when flag off`

### Task 4.4: Modify `synthesize-audio.ts`

**Files:** Modify `apps/worker/src/functions/synthesize-audio.ts`

- [ ] Change the trigger from `'virus/script.generated'` to a multi-event union: `['virus/assets.generated', 'virus/assets.skipped']`. Use Inngest's `event` array OR add a second trigger if SDK supports it. (Check current SDK syntax.)
- [ ] Body needs no other changes — both events carry `videoId`.
- [ ] **Test:** confirm function still works with both event names by mocking Inngest.
- [ ] Commit: `feat(worker): synthesize-audio listens to assets.generated|skipped`

### Task 4.5: Monitor function

**Files:** Create `apps/worker/src/functions/monitor-assets-failure-rate.ts`

- [ ] Implement Inngest scheduled function (cron: `*/15 * * * *`):

```ts
import { inngest } from '../inngest/index.js';
import { getAdminClient } from '../lib/supabase.js';

export const monitorAssetsFailureRate = inngest.createFunction(
  { id: 'monitor-assets-failure-rate' },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    const db = getAdminClient();
    const { data } = await db.rpc('compute_assets_failure_rate', { window_minutes: 60 });
    const row = data?.[0] ?? { total: 0, failed: 0, rate: 0 };
    if (row.total >= 10 && row.rate > 0.2) {
      await db.from('job_events').insert({
        video_id: '00000000-0000-0000-0000-000000000000', // sentinel
        step: 'monitoring.assets_high_failure',
        status: 'failed',
        payload: row,
      });
    }
    return row;
  },
);
```

- [ ] Register in `apps/worker/src/functions/index.ts`.
- [ ] Commit: `feat(worker): monitor assets failure rate`

### Task 4.6: Register all new functions

**Files:** Modify `apps/worker/src/functions/index.ts` and `packages/inngest/src/functions/index.ts` (whichever is the registry).

- [ ] Add `generateVisualAssets` and `monitorAssetsFailureRate` to the exported `functions` array so Inngest discovers them.
- [ ] Restart the dev server (`pnpm dev`). Verify both functions show up at `http://localhost:8288`.
- [ ] Commit: `feat(worker): register new Inngest functions`

---

## Phase 5 — Remotion components + templates

### Task 5.1: AssetErrorBoundary

**Files:** Create `packages/remotion/src/components/AssetErrorBoundary.tsx`

- [ ] React class component (Remotion needs class for boundaries) returning `null` on error. Error logged via `console.warn`.
- [ ] Commit: `feat(remotion): AssetErrorBoundary component`

### Task 5.2: AIBackgroundVideo

**Files:** Create `packages/remotion/src/components/AIBackgroundVideo.tsx`

- [ ] Implement: `<OffthreadVideo>` covering AbsoluteFill, with:
  - Slow Ken Burns scale 1.0 → 1.08 (interpolate over `durationInFrames`)
  - Dark tint overlay `rgba(0,0,0,0.55)`
  - Inner radial vignette
  - Glow ring in `themeColor` at low opacity
  - Wrapped in `AssetErrorBoundary`
- [ ] Props: `{ url: string; themeColor: string }`. If url falsy → return `null`.
- [ ] Commit: `feat(remotion): AIBackgroundVideo component`

### Task 5.3: AIHeroImage

**Files:** Create `packages/remotion/src/components/AIHeroImage.tsx`

- [ ] Implement: `<Img>` with parallax + Ken Burns + theme glow. Wrapped in error boundary.
- [ ] Commit: `feat(remotion): AIHeroImage component`

### Task 5.4: AssetBackdrop

**Files:** Create `packages/remotion/src/components/AssetBackdrop.tsx`

- [ ] Implement:

```tsx
import type { RenderAssets } from '@virus/shared/visuals';
import { AIBackgroundVideo } from './AIBackgroundVideo';
import { AIHeroImage } from './AIHeroImage';

export const AssetBackdrop: React.FC<{
  slot: 'hook' | 'reveal' | 'cta';
  assets?: RenderAssets;
  themeColor: string;
}> = ({ slot, assets, themeColor }) => {
  const ref = assets?.[slot];
  if (!ref) return null;
  if (ref.type === 'video') return <AIBackgroundVideo url={ref.url} themeColor={themeColor} />;
  return <AIHeroImage url={ref.url} themeColor={themeColor} />;
};
```

- [ ] Export from `packages/remotion/src/components/index.ts`.
- [ ] Commit: `feat(remotion): AssetBackdrop slot router`

### Task 5.5: Update `tip` template schema

**Files:** Modify `packages/remotion/src/templates/tip/schema.ts`

- [ ] Add to the schema:

```ts
const AssetRefSchema = z.object({
  url: z.string().url(),
  type: z.enum(['video', 'image']),
  durationSec: z.number().optional(),
});

const RenderAssetsSchema = z.object({
  hook: AssetRefSchema.optional(),
  reveal: AssetRefSchema.optional(),
  cta: AssetRefSchema.optional(),
}).optional();

// add to TipInput:
//   assets: RenderAssetsSchema,
```

- [ ] Commit: `feat(remotion/tip): assets prop in schema`

### Task 5.6: Update `tip` template index

**Files:** Modify `packages/remotion/src/templates/tip/index.tsx`

- [ ] In every `<Sequence>` whose `seg.role` is `hook | reveal | cta`, prepend an `<AssetBackdrop>`:

```tsx
{['hook','reveal','cta'].includes(seg.role) && (
  <AssetBackdrop slot={seg.role as any} assets={props.assets} themeColor={themeColor} />
)}
```

- [ ] Commit: `feat(remotion/tip): render AssetBackdrop behind hook/reveal/cta`

### Task 5.7: Repeat 5.5 + 5.6 for `hot-take`

- [ ] Same changes in `packages/remotion/src/templates/hot-take/`.
- [ ] Commit: `feat(remotion/hot-take): assets prop + AssetBackdrop`

### Task 5.8: Update RenderInputProps

**Files:** Modify `packages/shared/src/render/types.ts`

- [ ] Add `assets?: RenderAssets` to the input prop type used by both Remotion sites.
- [ ] Commit: `feat(shared/render): assets in RenderInputProps`

### Task 5.9: Re-deploy Remotion site

- [ ] Build: `pnpm --filter @virus/remotion build`
- [ ] Deploy to Lambda: `cd infra/remotion-lambda && npm run deploy`
- [ ] Verify the new `serveUrl` in Lambda dashboard shows the new bundle hash.
- [ ] Commit (no code change, but document in handoff): `chore(remotion): redeploy site with assets support`

---

## Phase 6 — Render pipeline integration

### Task 6.1: Update `render-video.ts`

**Files:** Modify `apps/worker/src/functions/render-video.ts`

- [ ] After loading the video, before `startRender`:
  - Read `videos.metadata.assets` (object of asset ids).
  - For each non-null id, query `visual_assets` for `storage_path`, `type`, `duration_sec`.
  - Generate signed URLs (1h TTL) via `supabase.storage.from('visual-assets').createSignedUrl(path, 3600)`.
  - HEAD-check each URL with `fetch(url, { method: 'HEAD' })`. If non-200 → log job_event with `step='render.url_check_failed'`, replace with undefined.
  - Build `RenderAssets` object and pass it as `assets` in `RenderInputProps`.
- [ ] Commit: `feat(worker): render-video resolves assets to signed URLs`

---

## Phase 7 — Dashboard UI

### Task 7.1: Asset choices form component

**Files:** Create `apps/web/src/app/(dashboard)/dashboard/ideas/_components/asset-choices-form.tsx`

- [ ] Client component with three rows of dropdowns. Each row:
  - Label: "Hook visual" / "Reveal" / "CTA"
  - Select: "Generar fresh" (default) / "Reusar de biblioteca" / "Elegir manual…"
  - On "Elegir manual…" → open modal with grid (paginated query of visual_assets filtered by category).
- [ ] State persisted to local component state; passed up to ideas-client via callback.
- [ ] Commit: `feat(web/ideas): asset-choices-form component`

### Task 7.2: Wire form into approve flow

**Files:** Modify `apps/web/src/app/(dashboard)/dashboard/ideas/_components/ideas-client.tsx`

- [ ] When user clicks "Aprobar y generar", before calling the API, render the `<AssetChoicesForm>` inline (or in a dialog). On confirm → call `/api/ideas/[id]/approve` with `{ asset_choices }` in body.
- [ ] Commit: `feat(web/ideas): asset choices in approve flow`

### Task 7.3: Update approve API

**Files:** Modify `apps/web/src/app/api/ideas/[id]/approve/route.ts`

- [ ] Accept optional `asset_choices` in body. Validate via `AssetChoicesSchema.safeParse`. Persist to `video_ideas.metadata.asset_choices` before emitting `virus/idea.approved`.
- [ ] Commit: `feat(web/api): persist asset_choices on idea approve`

### Task 7.4: Update test-seed API

**Files:** Modify `apps/web/src/app/api/ideas/test-seed/route.ts`

- [ ] If `autoApprove`, default `asset_choices` to all-fresh. Document in API doc-comment.
- [ ] Commit: `feat(web/api): default asset_choices in test-seed`

### Task 7.5: Assets library page (server component)

**Files:** Create `apps/web/src/app/(dashboard)/dashboard/assets/page.tsx`

- [ ] Server component: load active project, query first page of `visual_assets`, generate 7d signed URLs for thumbnails/previews, pass to client component.
- [ ] Commit: `feat(web/assets): page route + server data load`

### Task 7.6: Assets grid client component

**Files:** Create `apps/web/src/app/(dashboard)/dashboard/assets/_components/assets-grid.tsx`

- [ ] Filters: category, type, burned, tag.
- [ ] Each card: preview (`<video muted loop autoplay>` or `<img>`), prompt excerpt, last_used_at, use_count (computed via separate query).
- [ ] Actions: [Tag] [Regenerate] [Delete].
- [ ] Commit: `feat(web/assets): grid component with actions`

### Task 7.7: Assets API endpoints

**Files:** Create `apps/web/src/app/api/assets/route.ts` (GET) and `/[id]/route.ts` (DELETE, PATCH) and `/[id]/regenerate/route.ts` (POST).

- [ ] GET: paginated, filtered by query params.
- [ ] DELETE: set `burned=true`.
- [ ] PATCH: update `tags`.
- [ ] POST regenerate: emit `virus/assets.requested` event with same prompt → triggers a single-asset regen flow (V2-lite — for now, just create a new video pipeline OR enqueue an Inngest event the worker handles to generate one fresh asset).
- [ ] Commit: `feat(web/api): assets CRUD endpoints`

### Task 7.8: Sidebar link

**Files:** Modify the main dashboard sidebar to add "Biblioteca" linking to `/dashboard/assets`.

- [ ] Commit: `feat(web/dashboard): biblioteca sidebar link`

---

## Phase 8 — Verification + first premium video

### Task 8.1: Local feature flag flip

- [ ] Confirm `apps/worker/.env.local` has `ASSETS_ENABLED=true`.
- [ ] Restart worker (`pnpm dev`).
- [ ] Verify `inngest dev` shows `generate-visual-assets` and `monitor-assets-failure-rate` functions.

### Task 8.2: Smoke generate (manual)

- [ ] Visit `http://localhost:3003/dashboard/ideas`.
- [ ] Click "Generar video de prueba".
- [ ] Watch `/dashboard/pipeline` realtime status: pending → scripting → assets-generating (new) → audio → captions → rendering → ready.
- [ ] Open the rendered video. Verify backdrops appear behind hook/reveal/cta segments.
- [ ] Compare side-by-side with previous-style video.

### Task 8.3: Failure-mode tests

- [ ] **No keys:** unset `LUMA_API_KEY`, regenerate. Expect: video generates with NULL backdrops (black bg fallback), `assets.failed` events visible in Inngest dashboard, no crash.
- [ ] **Cap reached:** insert a fake `usage_records` row of $25 for your user. Regenerate. Expect: all 3 slots NULL, `job_events` row with `spend_cap_reached`.
- [ ] **Cache hit:** generate two videos with the same hook in a row (same script). Second video's `assets.generated` should reference the same asset ids as the first.

### Task 8.4: Reuse flow test

- [ ] In `/dashboard/ideas` approve flow, set Hook to "Reusar de biblioteca". Confirm the rendered video uses an existing asset (check `video_assets_used` table).

### Task 8.5: Manual selection test

- [ ] In approve flow, set Reveal to "Elegir manual…", pick an existing image. Confirm rendered video uses it.

### Task 8.6: Document the rotation reminder

- [ ] Update `HANDOFF-2026-05-05.md` (or create a new handoff for today) with: "Las API keys de Google AI y Luma fueron pegadas en chat. Rotarlas: revoke en consoles + replace en `.env.local`."
- [ ] Commit: `docs: handoff for assets pipeline + key rotation reminder`

---

## Skills referenced

- `@superpowers:subagent-driven-development` — execute tasks via fresh subagents per task
- `@superpowers:executing-plans` — execute inline with checkpoints
- `@superpowers:test-driven-development` — TDD discipline within each task
- `@superpowers:verification-before-completion` — never claim done without running the verify command

## Done criteria

1. ✅ All migrations applied, types regenerated, no schema drift.
2. ✅ `pnpm typecheck` passes across all workspaces.
3. ✅ `pnpm test` passes for `@virus/shared` and `@virus/worker`.
4. ✅ A test video generated locally with `ASSETS_ENABLED=true` shows AI backdrops behind hook/reveal/cta.
5. ✅ Removing API keys does NOT break the pipeline (clean fallback to black bg).
6. ✅ `/dashboard/assets` page lists generated assets with previews.
7. ✅ Asset reuse flow confirmed end-to-end.
8. ✅ `monitor-assets-failure-rate` function visible in Inngest dashboard.
