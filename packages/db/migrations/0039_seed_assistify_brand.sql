-- 0039: Backfill project_brand for projects missing one + set Assistify visual style.
--
-- Context: the carousel pipeline (generate-carousel-plan, load-context step)
-- requires a project_brand row with is_current=true and throws
-- CAROUSEL_NO_BRAND otherwise. Migration 0027 backfilled every project that
-- existed at the time, and createProject() now seeds a brand for new projects
-- — but Assistify slipped through both paths and had no brand row. Result: its
-- carousel generation failed (carousel_projects.error = 'CAROUSEL_NO_BRAND:...')
-- while APEX and BotLode generated fine.
--
-- This migration re-runs the generic 0027 backfill (so any project still
-- missing a brand is fixed and the bug can't recur) and then applies a proper
-- Assistify visual_style + imageProfile so its carousels match the brand
-- identity at assistify.lat (deep purple + soft amber on warm cream) instead
-- of falling back to the generic bold preset.
--
-- Idempotent: the backfill only inserts where no current brand exists; the
-- visual_style UPDATE uses jsonb merge so re-running is safe.

-- Step 1: ensure a project_info file exists for projects missing a brand.
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

-- Step 2: insert a minimal current project_brand for projects that lack one.
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

-- Step 3: Assistify brand voice + palette. Assistify (assistify.lat) is a
-- management app for teachers running academias / private classes. Palette:
-- deep purple #6D28D9 + soft amber #F59E0B on warm cream #FFFBEB. Headlines
-- are dark purple on the light cream background (the inverse of APEX's dark
-- mode), so textColor is the purple and bodyColor a near-black gray.
UPDATE public.project_brand
SET
  voice_tone = 'Tranquilizador, simple y profesional. Claro y organizado, nunca escolar-aburrido ni corporativo. Tono argentino natural.',
  visual_style = visual_style || '{
    "defaultPreset":  "bold",
    "textColor":      "#6D28D9",
    "bodyColor":      "#1F2937",
    "accentColor":    "#F59E0B",
    "backgroundColor":"#FFFBEB",
    "secondaryAccent":"#6D28D9",
    "fontPreference": "Inter, clean humanist sans-serif",
    "vibe":           "calm editorial flat — deep purple headlines and soft amber accents on warm cream"
  }'::jsonb
WHERE is_current = true
  AND brand_name ILIKE 'Assistify%';

-- Step 4: Assistify imageProfile — flat editorial illustration (Notion / Linear
-- / Headway style). Mirrors ASSISTIFY_IMAGE_PROFILE in
-- packages/shared/src/viral/seeds/image-profiles.ts.
UPDATE public.project_brand
SET visual_style = visual_style || jsonb_build_object(
  'imageProfile', '{
    "mode": "illustration-flat",
    "technique": "flat editorial illustration in the style of Notion / Linear / Headway: smooth gradients, simple geometric shapes, soft purple (#6D28D9) primary with amber (#F59E0B) accents on warm cream (#FFFBEB) background, subtle paper texture, clean vector edges, gentle drop shadows, no harsh contrast, no photorealism",
    "subjectStrategy": "world-anchor",
    "composition": "single hero element centered with one or two supporting accent shapes, generous negative space (40%+ in the lower half for overlay text), gentle composition with calm balance, no cluttered scenes, paper-craft sensibility",
    "moodKeywords": [
      "calm",
      "organized",
      "friendly",
      "professional",
      "modern",
      "clear",
      "reassuring",
      "editorial-flat",
      "minimalist"
    ],
    "negativeVisuals": [
      "faces (full)",
      "photoreal humans",
      "text",
      "letters",
      "words",
      "numbers (as readable text)",
      "logos",
      "watermarks",
      "school-cliche imagery",
      "chalkboard cliche",
      "apple-for-teacher cliche",
      "kid-cartoon aesthetic",
      "corporate stock-photo look",
      "neon colors",
      "dark mode",
      "aggressive contrast",
      "photoreal 3D",
      "overly playful childish style"
    ],
    "subjectLibrary": {
      "hook": [
        "a flat illustration of a single open notebook lying on a cream desk with a soft purple gradient page, amber bookmark sticking out",
        "a clean flat-design wall clock with one amber hour-hand and purple minute-hand, simple geometric shapes",
        "a flat illustration of a single empty calendar grid floating on cream with one square highlighted in amber, soft purple shadow",
        "a stylized flat coffee mug beside a closed laptop on a cream surface, warm morning light, soft purple accent on the mug",
        "a flat illustration of a single key floating above a keyring in cream and purple, suggesting access",
        "a soft flat illustration of an open door with calm amber light pouring out onto a cream floor"
      ],
      "problem": [
        "a flat illustration of an overloaded calendar with multiple overlapping events stacked messily, soft purple chaos on cream",
        "a tangle of crossed scheduling lines on a cream background, amber X marks where conflicts happen",
        "a flat illustration of a single tilting tower of paper folders about to topple, purple shadows",
        "a flat illustration of a phone showing a wall of unread WhatsApp messages, indicator dots in amber, cream background",
        "a stylized illustration of a clock with hands moving frantically, purple blur trails, amber face",
        "a flat illustration of a desk with scattered scribbled sticky notes overlapping chaotically, soft purple ink"
      ],
      "insight": [
        "a flat illustration of a single calendar grid where all events are neatly aligned into soft purple blocks, amber highlight on one",
        "a clean stylized illustration of two arrows transforming chaos on the left into order on the right, cream-purple-amber palette",
        "a flat lightbulb in soft amber with thin radiating purple rays on a cream background",
        "a stylized minimal illustration of a magnifying glass over a clean schedule, single amber detail highlighted",
        "a flat illustration of three stacked schedule cards perfectly aligned, soft drop shadows, amber accent on top one",
        "a serene illustration of a single open notebook with a tidy hand-drawn checkmark in amber on a cream page"
      ],
      "data": [
        "a flat illustration of a simple horizontal bar chart with purple bars on cream, the longest bar tipped in amber",
        "a clean minimal donut chart with one segment popping out in amber, the rest in soft purple shades",
        "a flat infographic showing three large stylized numerals (drawn as glyphs not readable text) in purple and amber on cream",
        "a flat illustration of a simple line graph rising gently, the line in purple with an amber endpoint dot, cream background",
        "a stylized illustration of a row of star shapes (4 filled amber, 1 outlined) on a soft cream card with purple border",
        "a flat composition of four small stat cards arranged neatly, one with an amber highlight, calm balanced layout"
      ],
      "example": [
        "a flat illustration of a tidy weekly view with class blocks neatly placed in soft purple, one block highlighted in amber",
        "a clean illustration of a phone showing a single appointment confirmed screen, amber checkmark, cream UI",
        "a flat scene of a small organized desk with a planner, mug, and pen, all aligned in calm cream and purple",
        "a stylized flat illustration of a paper invoice with a single amber paid stamp, cream paper, soft shadow",
        "a flat illustration of a notification card with a friendly amber bell icon and clean purple background",
        "a calm illustration of a single class block being moved smoothly across a calendar grid by an unseen hand, purple-amber palette"
      ],
      "cta": [
        "a flat illustration of an open door with calm amber light pouring through onto a cream floor, inviting entry",
        "a clean stylized illustration of a single arrow on a cream card, soft purple stroke with amber tip",
        "a flat illustration of a friendly speech bubble with a small amber dot inside, cream background, purple outline",
        "a flat composition of a hand offering a small key forward, soft purple sleeve, amber key, cream background",
        "a stylized minimal illustration of a phone with a single tap interaction shown as a soft purple ripple from the screen center",
        "a calm flat illustration of a checkmark inside a soft purple circle with an amber halo glowing around it, cream background"
      ]
    }
  }'::jsonb
)
WHERE is_current = true
  AND brand_name ILIKE 'Assistify%';
