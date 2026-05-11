-- 0027: Backfill project_brand for projects that don't have one.
--
-- Context: createProject() originally only inserted into `projects` and skipped
-- project_brand. The carousel pipeline (generate-carousel-plan) requires a row
-- in project_brand with is_current=true and throws CAROUSEL_NO_BRAND otherwise.
-- This migration ensures every active project has a minimal brand row so the
-- pipeline works out of the box. The worker applies its own defaults for any
-- empty/null fields.
--
-- Idempotent: only inserts where no current brand row exists for the project.

-- Step 1: For each project missing a project_info file, insert one. The brand
-- row needs source_file_id NOT NULL FK to project_files.
INSERT INTO public.project_files (project_id, kind, version, storage_path, mime_type, parse_status)
SELECT
  p.id,
  'project_info',
  1,
  'seed:backfill/' || p.id::text || '/brand.json',
  'application/json',
  'ok'
FROM public.projects p
WHERE p.status = 'active'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_brand pb
    WHERE pb.project_id = p.id AND pb.is_current = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.project_files pf
    WHERE pf.project_id = p.id AND pf.kind = 'project_info'
  );

-- Step 2: Insert minimal project_brand row for projects that lack one. Picks
-- the most recent project_info file (the one we just inserted, or a pre-
-- existing one) as source_file_id.
INSERT INTO public.project_brand (
  project_id,
  source_file_id,
  brand_name,
  one_liner,
  audience,
  value_props,
  features,
  case_studies,
  voice_tone,
  ctas,
  do_not_say,
  visual_style,
  raw,
  is_current
)
SELECT
  p.id,
  (
    SELECT pf.id FROM public.project_files pf
    WHERE pf.project_id = p.id AND pf.kind = 'project_info'
    ORDER BY pf.version DESC
    LIMIT 1
  ),
  p.name,
  '',
  '{"who": "", "where": "", "pains": []}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'directo y claro',
  '[]'::jsonb,
  '[]'::jsonb,
  '{"defaultPreset": "bold"}'::jsonb,
  '{}'::jsonb,
  true
FROM public.projects p
WHERE p.status = 'active'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_brand pb
    WHERE pb.project_id = p.id AND pb.is_current = true
  );
