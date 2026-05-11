-- 0031: Set visual_style for the APEX project brand.
--
-- APEX uses a tech-premium dark palette: electric cyan headlines (#00D4FF)
-- on deep navy (#050B18), with indigo accents (#6366F1).
-- This replaces the generic bold preset's yellow (#FFD60A) which doesn't
-- match the brand identity at theapexweb.com.
--
-- Idempotent: uses jsonb merge so re-running is safe.

UPDATE public.project_brand
SET visual_style = visual_style || '{
  "defaultPreset": "bold",
  "textColor":      "#00D4FF",
  "bodyColor":      "#FFFFFF",
  "accentColor":    "#6366F1",
  "backgroundColor":"#050B18",
  "secondaryAccent":"#00D4FF",
  "vibe":           "tech-premium dark mode — electric cyan headlines on deep navy"
}'::jsonb
WHERE is_current = true
  AND brand_name ILIKE 'APEX%';
