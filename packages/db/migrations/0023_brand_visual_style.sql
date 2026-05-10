-- 0023: visual style preference per project-brand and per profile (onboarding fallback)
-- visual_style structure: { defaultPreset: 'minimal'|'bold'|'editorial', accentColor?: string, fontPreference?: string, sampleImageUrls?: string[] }
-- visual_style_preference on profiles stores pre-project preference during onboarding

ALTER TABLE public.project_brand
  ADD COLUMN IF NOT EXISTS visual_style jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visual_style_preference jsonb NOT NULL DEFAULT '{}'::jsonb;
