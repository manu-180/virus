-- 0032: Add per-brand imageProfile to project_brand.visual_style.
--
-- Context: pre-0032 the carousel pipeline hardcoded a photographic, character-
-- anchored image generation flow in packages/shared/src/carousel/prompts.ts:
--
--   * buildSlidePlanPrompt instructed Claude to write visualPrompts like
--     "30-year-old argentine man in dark gray hoodie at minimalist desk".
--   * image-batch.ts then chained slide-0 → slide-N via Gemini image-to-image,
--     so every slide of every carousel showed the same person at the same desk.
--
-- This worked for personal-brand storytelling but produced 8 near-identical
-- photos for a tech studio like APEX, where the right look is editorial 3D
-- renders (Apple WWDC / Linear / Vercel) with no humans and a different
-- subject per slide.
--
-- This migration ships the new schema field `visual_style.imageProfile` and
-- populates it for APEX with a Dark Cinematic 3D profile. Other brands keep
-- their current visual_style (no imageProfile) and continue using the legacy
-- character-anchor flow until they're individually migrated.
--
-- Schema (TypeScript: BrandImageProfile in packages/shared/src/viral/types.ts):
--   {
--     mode: 'photo' | 'illustration-3d' | 'illustration-flat'
--         | 'illustration-line' | 'editorial-mixed',
--     technique: string,            -- detailed technique description
--     subjectStrategy: 'world-anchor' | 'character-anchor' | 'standalone',
--     composition: string,
--     moodKeywords: string[],
--     negativeVisuals: string[],
--     subjectLibrary?: { hook?, problem?, insight?, data?, example?, cta? }
--   }
--
-- Idempotent: uses jsonb merge (|| operator) on the `imageProfile` key so
-- re-running this migration overwrites the field cleanly without dropping
-- other visual_style entries.

UPDATE public.project_brand
SET visual_style = visual_style || jsonb_build_object(
  'imageProfile', '{
    "mode": "illustration-3d",
    "technique": "premium 3D render in the style of Apple WWDC keynote slides and Linear product launch announcements: matte materials with subtle subsurface scattering, dramatic edge lighting in electric cyan (#00D4FF) and indigo (#6366F1), deep navy near-black background (#050B18), shallow depth of field, octane/redshift-style rendering, micro-bokeh highlights, controlled specular reflections, museum-quality lighting setup, no flat shading, no cartoon style",
    "subjectStrategy": "world-anchor",
    "composition": "single hero subject perfectly centered or rule-of-thirds, 40%+ negative space in the lower half for overlay text, single primary key light from upper-left at 45 degrees, secondary cyan rim-light from behind the subject, occasional dust particles in the light beams, shallow depth of field with creamy navy bokeh, hyper-clean composition with no clutter",
    "moodKeywords": [
      "cinematic",
      "premium",
      "tech-forward",
      "moody",
      "minimalist",
      "high-end",
      "editorial",
      "scroll-stopping",
      "sophisticated"
    ],
    "negativeVisuals": [
      "humans",
      "faces",
      "people",
      "hands",
      "text",
      "letters",
      "words",
      "typography",
      "logos",
      "watermarks",
      "stock-photo look",
      "clip-art",
      "cartoon",
      "flat shading",
      "clutter",
      "busy backgrounds",
      "warm colors except cyan/indigo accents",
      "yellow",
      "orange",
      "red except for warning-glow accents",
      "low-resolution",
      "compressed artifacts",
      "amateur lighting"
    ],
    "subjectLibrary": {
      "hook": [
        "a single fragmented dark monolith floating in space with glowing cyan fissures running through its surface, dramatic edge lighting from above-left, dust particles in the rim light",
        "a sleek smartphone floating in dark space with an abstract holographic UI panel hovering above it, faint indigo and cyan particles drifting around the edges",
        "an extreme close-up of a glowing keyboard in dim light, cyan key-glow seeping between the keys, deep navy bokeh behind",
        "a sealed glass vault containing a single floating cyan crystal, faint indigo glow rising from below, dramatic side lighting",
        "a darkened laptop with a single thin beam of cyan light escaping from a partially-open lid, smoke-like particles caught in the beam",
        "a glowing 3D wireframe globe rotating in space with thin cyan latitude lines, deep navy void around it"
      ],
      "problem": [
        "a shattered geometric prism floating mid-air with deep cracks leaking red warning glow, broken fragments suspended in space around it",
        "a glitched dark screen showing a corrupted UI with scan-lines and digital artifacts, faint red leak across the bottom edge",
        "a melting wireframe sphere disintegrating into dark pixels, deep red undertones in the falling fragments",
        "a stack of dark shipping crates with one fallen open revealing a tangled mess of cables, dim red warning light from the open one",
        "a circuit board photographed in dim light with a single component glowing red-hot, scorched marks radiating from it",
        "a tangle of dark cables knotted around a single dimly-lit chip, faint red warning glow underneath"
      ],
      "insight": [
        "a single illuminated 3D cube floating in dark space, internal cyan glow revealing complex inner geometry through its translucent faces",
        "a holographic schematic blueprint of a clean system architecture, lines drawn in glowing cyan against deep navy void",
        "a glass prism splitting a beam of white light into a precise spectrum of cyan-to-indigo shades, dust particles in the beam",
        "a dark vault door cracked open with cyan light pouring out, revealing geometric structures inside",
        "an abstract 3D maze viewed top-down with a single illuminated path glowing cyan through the dark corridors",
        "a smooth dark sphere with a single bright cyan dot of light embedded in it, signaling a key idea"
      ],
      "data": [
        "a floating 3D bar chart with the tallest bar glowing electric cyan, the others in muted indigo, near-black background",
        "an abstract data visualization with glowing nodes connected by faint cyan filaments, network topology with one node larger and brighter",
        "a holographic KPI dashboard floating in dark space, the key metric oversized and glowing cyan, supporting numbers smaller around it",
        "a 3D line graph with the line drawn in pure cyan light leaving a trailing glow, rising sharply from left to right",
        "a circular ring chart with one segment exploding outward in glowing cyan, the others dimmed in indigo",
        "an abstract heatmap rendered as glowing 3D pillars rising from a dark grid, the central cluster brightest in cyan"
      ],
      "example": [
        "a zoomed-in 3D render of a single iPhone app screen frozen mid-interaction, cyan accent on the key UI element being highlighted",
        "a close-up of a glass laptop screen showing a single code window with cyan syntax highlighting against deep navy background",
        "a 3D isometric of a tiny abstract office workspace floating in dark space, lit only by the cyan glow of a single monitor on the desk",
        "a single illuminated component (USB-C connector, glass marble, mechanical key, or sleek device) on a dark reflective surface",
        "a 3D render of a glass cube containing a tiny working scene (gears, levers, a small bot) shown from a dramatic hero angle",
        "a hand-held magnifying glass made of cyan light hovering over a dark surface, revealing a glowing detail underneath"
      ],
      "cta": [
        "the fragmented monolith from the opening shot, now whole and fully illuminated with steady cyan glow, no cracks, calm composed lighting",
        "a smartphone floating in space with a clean resolved app UI on screen, a soft cyan checkmark glowing in the center, no particles",
        "an open vault revealing a perfectly geometric cyan crystal, steady ambient indigo light, peaceful resolved mood",
        "a clear directional cyan arrow made of light beams pointing forward in dark space, soft indigo glow around its tip",
        "a single illuminated door slightly open at the end of a dark corridor with cyan light pouring through, inviting forward motion",
        "a glowing cyan ring of light hovering above a calm dark surface, steady soft pulse, fully resolved composition"
      ]
    }
  }'::jsonb
)
WHERE is_current = true
  AND brand_name ILIKE 'APEX%';
