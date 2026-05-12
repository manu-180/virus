/**
 * Ready-made BrandImageProfile templates for the projects Manuel runs:
 * APEX, BotLode, OficiosApp, Assistify. Each profile is tuned for what
 * converts in its niche on Instagram (2025-2026) and matches each brand's
 * existing color palette.
 *
 * These are TEMPLATES — copy them into `project_brand.visual_style` via
 * SQL UPDATE when onboarding a new brand. Each one is independently editable.
 *
 * Architecture notes:
 *  - `subjectStrategy: 'world-anchor'` is the modern default. NO image-to-image
 *    chaining: every slide is independent text-to-image, with continuity
 *    coming from technique + palette + composition. This is what fixes
 *    "every slide looks the same" because each slide picks a different
 *    subject from its role's subjectLibrary.
 *  - Use `subjectStrategy: 'character-anchor'` ONLY when the carousel's
 *    narrative is about a single human protagonist (e.g., personal-brand
 *    storytelling). For B2B SaaS / dev studios / trades apps, world-anchor
 *    is almost always the right call.
 *  - `mode` should match the audience's expectations:
 *      tech B2B    → illustration-3d (premium) or illustration-line (technical)
 *      B2C trades  → editorial-mixed or photo (approachable, human warmth)
 *      education   → illustration-flat (clean, friendly diagrams)
 *      lifestyle   → photo (cinematic editorial)
 */

import type { BrandImageProfile } from '../types.js';

// ---------------------------------------------------------------------------
// APEX — Dev studio (Flutter + Next.js + Supabase)
//
// Audience: tech founders LATAM. Palette: cyan #00D4FF + indigo #6366F1 on
// deep navy #050B18. Tone: directo, premium, contrarian, sin BS.
// ---------------------------------------------------------------------------

export const APEX_IMAGE_PROFILE: BrandImageProfile = {
  mode: 'illustration-3d',
  technique:
    'premium 3D render in the style of Apple WWDC keynote slides and Linear product launch announcements: matte materials with subtle subsurface scattering, dramatic edge lighting in electric cyan (#00D4FF) and indigo (#6366F1), deep navy near-black background (#050B18), shallow depth of field, octane/redshift-style rendering, micro-bokeh highlights, controlled specular reflections, museum-quality lighting setup, no flat shading, no cartoon style',
  subjectStrategy: 'world-anchor',
  composition:
    'single hero subject perfectly centered or rule-of-thirds, 40%+ negative space in the lower half for overlay text, single primary key light from upper-left at 45 degrees, secondary cyan rim-light from behind the subject, occasional dust particles in the light beams, shallow depth of field with creamy navy bokeh, hyper-clean composition with no clutter',
  moodKeywords: [
    'cinematic',
    'premium',
    'tech-forward',
    'moody',
    'minimalist',
    'high-end',
    'editorial',
    'scroll-stopping',
    'sophisticated',
  ],
  negativeVisuals: [
    'humans',
    'faces',
    'people',
    'hands',
    'text',
    'letters',
    'words',
    'typography',
    'logos',
    'watermarks',
    'stock-photo look',
    'clip-art',
    'cartoon',
    'flat shading',
    'clutter',
    'busy backgrounds',
    'warm colors except cyan/indigo accents',
    'yellow',
    'orange',
    'red except for warning-glow accents',
    'low-resolution',
    'compressed artifacts',
    'amateur lighting',
  ],
  subjectLibrary: {
    hook: [
      'a single fragmented dark monolith floating in space with glowing cyan fissures running through its surface, dramatic edge lighting from above-left, dust particles in the rim light',
      'a sleek smartphone floating in dark space with an abstract holographic UI panel hovering above it, faint indigo and cyan particles drifting around the edges',
      'an extreme close-up of a glowing keyboard in dim light, cyan key-glow seeping between the keys, deep navy bokeh behind',
      'a sealed glass vault containing a single floating cyan crystal, faint indigo glow rising from below, dramatic side lighting',
      'a darkened laptop with a single thin beam of cyan light escaping from a partially-open lid, smoke-like particles caught in the beam',
      'a glowing 3D wireframe globe rotating in space with thin cyan latitude lines, deep navy void around it',
    ],
    problem: [
      'a shattered geometric prism floating mid-air with deep cracks leaking red warning glow, broken fragments suspended in space around it',
      'a glitched dark screen showing a corrupted UI with scan-lines and digital artifacts, faint red leak across the bottom edge',
      'a melting wireframe sphere disintegrating into dark pixels, deep red undertones in the falling fragments',
      'a stack of dark shipping crates with one fallen open revealing a tangled mess of cables, dim red warning light from the open one',
      'a circuit board photographed in dim light with a single component glowing red-hot, scorched marks radiating from it',
      'a tangle of dark cables knotted around a single dimly-lit chip, faint red warning glow underneath',
    ],
    insight: [
      'a single illuminated 3D cube floating in dark space, internal cyan glow revealing complex inner geometry through its translucent faces',
      'a holographic schematic blueprint of a clean system architecture, lines drawn in glowing cyan against deep navy void',
      'a glass prism splitting a beam of white light into a precise spectrum of cyan-to-indigo shades, dust particles in the beam',
      'a dark vault door cracked open with cyan light pouring out, revealing geometric structures inside',
      'an abstract 3D maze viewed top-down with a single illuminated path glowing cyan through the dark corridors',
      'a smooth dark sphere with a single bright cyan dot of light embedded in it, signaling a key idea',
    ],
    data: [
      'a floating 3D bar chart with the tallest bar glowing electric cyan, the others in muted indigo, near-black background',
      'an abstract data visualization with glowing nodes connected by faint cyan filaments, network topology with one node larger and brighter',
      'a holographic KPI dashboard floating in dark space, the key metric oversized and glowing cyan, supporting numbers smaller around it',
      'a 3D line graph with the line drawn in pure cyan light leaving a trailing glow, rising sharply from left to right',
      'a circular ring chart with one segment exploding outward in glowing cyan, the others dimmed in indigo',
      'an abstract heatmap rendered as glowing 3D pillars rising from a dark grid, the central cluster brightest in cyan',
    ],
    example: [
      'a zoomed-in 3D render of a single iPhone app screen frozen mid-interaction, cyan accent on the key UI element being highlighted',
      'a close-up of a glass laptop screen showing a single code window with cyan syntax highlighting against deep navy background',
      'a 3D isometric of a tiny abstract office workspace floating in dark space, lit only by the cyan glow of a single monitor on the desk',
      'a single illuminated component (USB-C connector, glass marble, mechanical key, or sleek device) on a dark reflective surface',
      'a 3D render of a glass cube containing a tiny working scene (gears, levers, a small bot) shown from a dramatic hero angle',
      'a hand-held magnifying glass made of cyan light hovering over a dark surface, revealing a glowing detail underneath',
    ],
    cta: [
      'the fragmented monolith from the opening shot, now whole and fully illuminated with steady cyan glow, no cracks, calm composed lighting',
      'a smartphone floating in space with a clean resolved app UI on screen, a soft cyan checkmark glowing in the center, no particles',
      'an open vault revealing a perfectly geometric cyan crystal, steady ambient indigo light, peaceful resolved mood',
      'a clear directional cyan arrow made of light beams pointing forward in dark space, soft indigo glow around its tip',
      'a single illuminated door slightly open at the end of a dark corridor with cyan light pouring through, inviting forward motion',
      'a glowing cyan ring of light hovering above a calm dark surface, steady soft pulse, fully resolved composition',
    ],
  },
};

// ---------------------------------------------------------------------------
// BotLode — Chatbot / IA-automation SaaS (botlode.com)
//
// Audience: founders + marketers que quieren automatizar WhatsApp / customer
// support / lead-gen. Palette: vibrant magenta + electric purple on deep
// indigo background. Tone: playful-tech, friendly, capable.
// ---------------------------------------------------------------------------

export const BOTLODE_IMAGE_PROFILE: BrandImageProfile = {
  mode: 'illustration-3d',
  technique:
    'glossy 3D illustration in a playful-tech style halfway between Pixar and a modern SaaS keynote: smooth subdivided surfaces, soft global illumination, bright magenta (#E879F9) and electric purple (#A855F7) accent lighting, deep indigo (#1E1B4B) background with subtle gradient toward midnight blue, glass-like materials, rim lights, lots of bokeh particles, premium clean rendering',
  subjectStrategy: 'world-anchor',
  composition:
    'central hero subject with one or two supporting elements floating around it, 40% negative space in the lower half for overlay text, primary light from front-left, magenta rim-light from behind, occasional sparkle/particle effects suggesting motion or magic, shallow depth of field with soft purple bokeh, playful but premium',
  moodKeywords: [
    'playful',
    'premium',
    'tech-magical',
    'friendly',
    'energetic',
    'modern-saas',
    'optimistic',
    'scroll-stopping',
  ],
  negativeVisuals: [
    'humans',
    'faces',
    'photoreal humans',
    'text',
    'letters',
    'words',
    'logos',
    'watermarks',
    'cliche robot mascot',
    'stock-photo look',
    'clip-art',
    'flat shading',
    'busy backgrounds',
    'warm earth tones',
    'beige',
    'low-resolution',
    'amateur lighting',
    'corporate stiffness',
  ],
  subjectLibrary: {
    hook: [
      'a glowing 3D speech bubble floating in space, magenta interior glow, single sparkle escaping the top, deep indigo background',
      'a stylized 3D phone with a chat conversation floating off its screen as separate glass bubbles, each lit with magenta and purple',
      'an abstract glowing orb of light hovering between two minimalist devices, faint conversation flow particles connecting them',
      'a sleek 3D message envelope cracking open with light pouring out, magenta-purple particles streaming up',
      'a single glass chat bubble suspended in dark space, internal swirl of magenta light, premium glossy surface',
      'an abstract animated mascot made of pure light geometry (no face), curious posture, gentle purple glow',
    ],
    problem: [
      'a phone screen showing a long unread conversation, dim and dusty, faint red warning indicator at the corner',
      'a tangle of disconnected speech bubbles falling apart in dark space, broken edges showing dim red leak',
      'an overflowing 3D inbox with stacks of glowing-but-dimming messages spilling out, indigo gloom around it',
      'a glitched chat bubble fragmenting into shards mid-air, faint red-magenta warning glow from cracks',
      'a single sad-looking glass orb (no face) floating in dim space, faint red pulse signaling missed messages',
      'a clock made of 3D message bubbles where some bubbles are decaying, indicating slow response time',
    ],
    insight: [
      'a glowing magenta brain-like neural mesh inside a translucent glass sphere, floating in deep indigo space',
      'an exploded view of a chat bubble showing layered components inside, each layer glowing a different shade of purple',
      'a 3D abstract diagram of two paths converging into one bright magenta destination, soft particle trail',
      'a glass prism splitting a single message ray into multiple personalized colored beams, premium clean lighting',
      'a single bright magenta lightbulb floating above a 3D conversation tree, illuminating the structure below',
      'a clean 3D infographic showing one input bubble fanning out into multiple personalized responses, glowing connections',
    ],
    data: [
      'a 3D vertical bar chart of conversations, the tallest bar glowing bright magenta, the rest in subdued purple, deep indigo backdrop',
      'a floating glassy dashboard panel showing a single oversized metric with a steep upward arrow, magenta accents',
      'a 3D donut chart with one segment bursting outward in glowing magenta, others dimmed in purple',
      'a network graph of conversation nodes connected by glowing magenta filaments, one cluster prominently larger',
      'a smooth 3D line graph rising sharply, the line itself made of pure magenta light leaving a trailing glow',
      'an abstract heatmap rendered as glowing 3D tiles, the brightest tile pulsing magenta',
    ],
    example: [
      'a 3D phone showing one isolated chat screen with a single clean response, premium glass screen, magenta accent on the send button',
      'an isometric 3D view of a tiny WhatsApp scene with a single conversation bubble lit up among many dimmer ones',
      'a single 3D-rendered automation flow card floating in space, clean connectors, magenta highlight on the active step',
      'a glass display case showing a single product (a glowing orb or geometric token) representing a use case',
      'an abstract 3D scene of a customer journey: starting orb, flow line, ending orb, all in magenta-purple gradient',
      'a 3D cutaway of a glass funnel with messages flowing through it, the bottom output glowing bright magenta',
    ],
    cta: [
      'a single glowing magenta arrow pointing forward in dark space, soft purple trail behind it, calm composition',
      'an open 3D portal-like ring of magenta light hovering in deep indigo space, inviting forward motion',
      'a stylized 3D mascot orb (no face) with a friendly glowing aura, gently bouncing in place',
      'a 3D ribbon of light forming the shape of a forward chevron, magenta-to-purple gradient',
      'a single glass chat bubble with a soft magenta checkmark inside, calm resolved mood',
      'a 3D pedestal under a glowing magenta crystal, soft halo of purple light around it, premium product-shot feel',
    ],
  },
};

// ---------------------------------------------------------------------------
// OficiosApp — Marketplace de oficios (plomería, electricidad, albañilería)
//
// Audience: clientes finales buscando un servicio + profesionales del oficio
// publicando su trabajo. Vibe: cercano, confiable, profesional pero humano.
// Palette: warm orange #F97316 + deep teal #0F766E on soft cream #FAF7F0.
// Tone: directo, claro, sin tecnicismos, hablado.
// ---------------------------------------------------------------------------

export const OFICIOS_IMAGE_PROFILE: BrandImageProfile = {
  mode: 'editorial-mixed',
  technique:
    'editorial photography with the polish of a Patagonia / Toast UK / Aesop campaign: natural daylight, slightly warm color grade, soft shadows, real materials (wood, leather, metal, fabric), shallow depth of field, hands-on craft aesthetic, no glossy CGI feel. When 3D illustration is used instead, render in a flat-but-textured style (Notion/Linear illustrations) with warm orange and deep teal accents on cream background',
  subjectStrategy: 'world-anchor',
  composition:
    'close-up of a single object or pair of hands at work, warm side lighting from a window, lots of negative space in the lower third for text, natural film grain, no stock-photo look, no aggressive posing',
  moodKeywords: [
    'warm',
    'trustworthy',
    'human',
    'craft',
    'natural',
    'approachable',
    'professional',
    'editorial',
    'authentic',
  ],
  negativeVisuals: [
    'faces (full)',
    'text',
    'letters',
    'words',
    'logos',
    'watermarks',
    'stock-photo cliche',
    'corporate handshake',
    'fake smiles',
    'overly clean studio look',
    'neon colors',
    'futuristic tech aesthetic',
    'dark mode',
    'cyan',
    'magenta',
    'cartoon mascots',
    'low-resolution',
  ],
  subjectLibrary: {
    hook: [
      'a single pair of working hands resting on a wooden workbench beside a worn leather tool belt, warm window light from the left, dust particles in the air',
      'an extreme close-up of a brass faucet with a single drop of water frozen mid-fall, natural light, warm tones',
      'a single weathered hand holding a paintbrush above an open paint can, soft daylight, cream-and-orange palette',
      'a flat-textured illustration of a friendly toolbox open on a warm wood floor, orange and teal accents on cream',
      'a close-up of a coiled extension cord on rough concrete with warm orange evening light spilling across it',
      'a wrench resting on a vintage tile floor with a single sunbeam highlighting the metal, editorial film-photo quality',
    ],
    problem: [
      'a close-up of a dripping kitchen tap with a small puddle forming below, cold blue-gray tone hinting at the problem',
      'a cracked tile in a bathroom corner with dust around it, natural light, slightly somber color grade',
      'a chaotic pile of mismatched cables on a wood floor, warm light but cluttered composition signaling overwhelm',
      'an old wallpaper peeling in a corner with a thin shadow falling across it, editorial documentary feel',
      'a flat illustration of a confused homeowner silhouette (no face) staring at a broken pipe, soft warm palette with one teal accent',
      'a half-finished paint job on a wall with the roller abandoned mid-stroke, natural lighting',
    ],
    insight: [
      'a single hand pointing precisely at a critical detail on a wooden surface, soft warm light, shallow depth of field',
      'a flat illustration showing a clear before/after split in soft warm tones, one side messy one side resolved',
      'a clean tape measure stretched across a fresh wooden plank, daylight, focused composition',
      'an open notebook on a workbench with a single hand-drawn schematic visible, cream paper, orange ink',
      'a magnifying glass over a small mechanical detail of a faucet or hinge, daylight, warm grain',
      'a flat illustration of a small lightbulb idea above a stylized house outline, warm orange glow on cream background',
    ],
    data: [
      'a flat editorial illustration of a simple bar chart drawn on a cream background with orange and teal bars, hand-drawn feel',
      'a clean handwritten price sheet on warm paper with one number circled, daylight',
      'a flat infographic of three icons (clock, peso, hand) lined up on cream, simple and clear',
      'an open small chalkboard with a single number written in white chalk, warm setting',
      'a tidy stack of receipts and an old-school calculator on a workbench, single sunbeam highlighting the total',
      'a flat illustration of a star-rating row of 5 stars, four filled in warm orange one half-filled, cream background',
    ],
    example: [
      'a single restored brass doorknob on a freshly painted door, warm side lighting, magazine-quality finish',
      'a flat illustration of a tidy bathroom corner after a repair, soft warm palette, clean composition',
      'a freshly mounted shelf on a textured wall with a single object on it, daylight from the right',
      'an isometric flat illustration of a small kitchen scene where one detail (a fixed tap, a new tile) glows softly',
      'a close-up of a polished wood floor reflecting a sunbeam, recently sealed, editorial detail shot',
      'a flat illustration of a smiling generic homeowner figure (back view, no face) standing in a fixed-up room',
    ],
    cta: [
      'a single weathered hand offering a business card forward into the frame, soft daylight, warm tones',
      'a flat illustration of a friendly speech bubble on cream background with orange and teal accents, inviting',
      'a clean wood doorway slightly ajar with warm light pouring through, suggesting "step in"',
      'an outstretched hand holding a single house key catching the light, shallow depth of field',
      'a flat illustration of a phone outline on cream with a single teal arrow pointing into it, simple direct',
      'a freshly written WhatsApp-style speech bubble drawn on cream paper, orange ink, single tick mark',
    ],
  },
};

// ---------------------------------------------------------------------------
// Assistify — App de gestión para profesores (assistify.lat)
//
// Audience: docentes de academias / clases particulares / institutos. Vibe:
// claro, organizado, amable, no escolar-aburrido. Palette: deep purple
// #6D28D9 + soft amber #F59E0B on warm cream #FFFBEB.
// Tone: tranquilizador, simple, profesional.
// ---------------------------------------------------------------------------

export const ASSISTIFY_IMAGE_PROFILE: BrandImageProfile = {
  mode: 'illustration-flat',
  technique:
    'flat editorial illustration in the style of Notion / Linear / Headway: smooth gradients, simple geometric shapes, soft purple (#6D28D9) primary with amber (#F59E0B) accents on warm cream (#FFFBEB) background, subtle paper texture, clean vector edges, gentle drop shadows, no harsh contrast, no photorealism',
  subjectStrategy: 'world-anchor',
  composition:
    'single hero element centered with one or two supporting accent shapes, generous negative space (40%+ in the lower half for overlay text), gentle composition with calm balance, no cluttered scenes, paper-craft sensibility',
  moodKeywords: [
    'calm',
    'organized',
    'friendly',
    'professional',
    'modern',
    'clear',
    'reassuring',
    'editorial-flat',
    'minimalist',
  ],
  negativeVisuals: [
    'faces (full)',
    'photoreal humans',
    'text',
    'letters',
    'words',
    'numbers (as readable text)',
    'logos',
    'watermarks',
    'school-cliche imagery',
    'chalkboard cliche',
    'apple-for-teacher cliche',
    'kid-cartoon aesthetic',
    'corporate stock-photo look',
    'neon colors',
    'dark mode',
    'aggressive contrast',
    'photoreal 3D',
    'overly playful childish style',
  ],
  subjectLibrary: {
    hook: [
      'a flat illustration of a single open notebook lying on a cream desk with a soft purple gradient page, amber bookmark sticking out',
      'a clean flat-design wall clock with one amber hour-hand and purple minute-hand, simple geometric shapes',
      'a flat illustration of a single empty calendar grid floating on cream with one square highlighted in amber, soft purple shadow',
      'a stylized flat coffee mug beside a closed laptop on a cream surface, warm morning light, soft purple accent on the mug',
      'a flat illustration of a single key floating above a keyring in cream and purple, suggesting access',
      'a soft flat illustration of an open door with calm amber light pouring out onto a cream floor',
    ],
    problem: [
      'a flat illustration of an overloaded calendar with multiple overlapping events stacked messily, soft purple chaos on cream',
      'a tangle of crossed scheduling lines on a cream background, amber X marks where conflicts happen',
      'a flat illustration of a single tilting tower of paper folders about to topple, purple shadows',
      'a flat illustration of a phone showing a wall of unread WhatsApp messages, indicator dots in amber, cream background',
      'a stylized illustration of a clock with hands moving frantically, purple blur trails, amber face',
      'a flat illustration of a desk with scattered scribbled sticky notes overlapping chaotically, soft purple ink',
    ],
    insight: [
      'a flat illustration of a single calendar grid where all events are neatly aligned into soft purple blocks, amber highlight on one',
      'a clean stylized illustration of two arrows transforming chaos on the left into order on the right, cream-purple-amber palette',
      'a flat lightbulb in soft amber with thin radiating purple rays on a cream background',
      'a stylized minimal illustration of a magnifying glass over a clean schedule, single amber detail highlighted',
      'a flat illustration of three stacked schedule cards perfectly aligned, soft drop shadows, amber accent on top one',
      'a serene illustration of a single open notebook with a tidy hand-drawn checkmark in amber on a cream page',
    ],
    data: [
      'a flat illustration of a simple horizontal bar chart with purple bars on cream, the longest bar tipped in amber',
      'a clean minimal donut chart with one segment popping out in amber, the rest in soft purple shades',
      'a flat infographic showing three large stylized numerals (drawn as glyphs not readable text) in purple and amber on cream',
      'a flat illustration of a simple line graph rising gently, the line in purple with an amber endpoint dot, cream background',
      'a stylized illustration of a row of star shapes (4 filled amber, 1 outlined) on a soft cream card with purple border',
      'a flat composition of four small stat cards arranged neatly, one with an amber highlight, calm balanced layout',
    ],
    example: [
      'a flat illustration of a tidy weekly view with class blocks neatly placed in soft purple, one block highlighted in amber',
      'a clean illustration of a phone showing a single appointment confirmed screen, amber checkmark, cream UI',
      'a flat scene of a small organized desk with a planner, mug, and pen, all aligned in calm cream and purple',
      'a stylized flat illustration of a paper invoice with a single amber paid stamp, cream paper, soft shadow',
      'a flat illustration of a notification card with a friendly amber bell icon and clean purple background',
      'a calm illustration of a single class block being moved smoothly across a calendar grid by an unseen hand, purple-amber palette',
    ],
    cta: [
      'a flat illustration of an open door with calm amber light pouring through onto a cream floor, inviting entry',
      'a clean stylized illustration of a single arrow on a cream card, soft purple stroke with amber tip',
      'a flat illustration of a friendly speech bubble with a small amber dot inside, cream background, purple outline',
      'a flat composition of a hand offering a small key forward, soft purple sleeve, amber key, cream background',
      'a stylized minimal illustration of a phone with a single tap interaction shown as a soft purple ripple from the screen center',
      'a calm flat illustration of a checkmark inside a soft purple circle with an amber halo glowing around it, cream background',
    ],
  },
};

// ---------------------------------------------------------------------------
// Convenience exports for picking a profile by brand slug
// ---------------------------------------------------------------------------

export const IMAGE_PROFILES: Record<string, BrandImageProfile> = {
  apex: APEX_IMAGE_PROFILE,
  'apex-dev': APEX_IMAGE_PROFILE,
  botlode: BOTLODE_IMAGE_PROFILE,
  oficios: OFICIOS_IMAGE_PROFILE,
  oficiosapp: OFICIOS_IMAGE_PROFILE,
  assistify: ASSISTIFY_IMAGE_PROFILE,
};

export function getImageProfileForBrand(slugOrName: string): BrandImageProfile | undefined {
  const key = slugOrName.toLowerCase().trim();
  return IMAGE_PROFILES[key];
}
