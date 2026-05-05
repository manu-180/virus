# `@virus/shared` — viral package

Generic viral-pattern engine for multi-niche short-form content. Parses project-specific pattern files (markdown or JSON) into structured `ProjectPatterns` and `ProjectBrand` objects, then runs a deterministic suggestion engine to pick the best hook + topic + format combination for the next video — with built-in anti-repeat filtering.

---

## 1. Overview

The package is organised into three layers:

| Layer | Path | Responsibility |
|---|---|---|
| Types | `types.ts` | All shared interfaces (`ProjectPatterns`, `ProjectBrand`, `SuggestInput`, etc.) |
| Parser | `parser/` | Convert raw markdown or JSON files into typed objects |
| Engine | `engine/` | Score and select the next content combination; anti-repeat; caption builder |

The design is intentionally niche-agnostic. Drop in any `viral-patterns.md` file — tech, fitness, finance — and the engine works the same way.

---

## 2. How to use `parsePatterns` and `parseBrand`

Call these from any worker or API route that ingests project files.

```ts
import { parser } from '@virus/shared/viral';

// From a markdown file
const patternsResult = parser.parsePatterns({
  source: await fs.readFile('viral-patterns.md', 'utf8'),
  mimeType: 'text/markdown',
  projectId: 'apex-saas',
});

if (!patternsResult.ok) {
  console.error('Parse failed:', patternsResult.error);
  // patternsResult.partial is available for diagnostic output
  process.exit(1);
}

const patterns = patternsResult.data;

// From a JSON file (same API, different mimeType)
const brandResult = parser.parseBrand({
  source: await fs.readFile('brand.json', 'utf8'),
  mimeType: 'application/json',
  projectId: 'apex-saas',
});

if (!brandResult.ok) {
  console.error('Brand parse failed:', brandResult.error);
  process.exit(1);
}

const brand = brandResult.data;
```

`parsePatterns` returns `{ ok: true; data: ProjectPatterns }` or `{ ok: false; error: string; partial? }`.
`parseBrand` follows the same shape.

Both functions support `mimeType: 'text/markdown'`, `'text/plain'`, and `'application/json'`.

---

## 3. How `suggest()` works

`suggest()` takes all parsed data plus a history of recent signatures and returns the single best content combination.

```ts
import { engine } from '@virus/shared/viral';
import type { SuggestInput, SuggestOutput } from '@virus/shared/viral';

const input: SuggestInput = {
  patterns,
  brand,
  recentSignatures: await db.getRecentSignatures('apex-saas'), // last 30 days
  // optional:
  preferredFormats: ['Speed Build'],
  pillarHint: 'automation',
};

let output: SuggestOutput;
try {
  output = await engine.suggest(input);
} catch (err: unknown) {
  const e = err as { code: string; message: string };
  if (e.code === 'no_candidates') {
    console.warn('All hooks/topics filtered. Wait or expand windows.');
    return;
  }
  throw err;
}

console.log('Selected hook:', output.hook.text);
console.log('Selected topic:', output.topic.name);
console.log('Format:', output.format.name);
console.log('Rationale:', output.rationale);

// Persist the signature to prevent repeats
await db.saveSignature('apex-saas', {
  ...output.signature,
  usedAt: new Date().toISOString(),
});
```

**Internal algorithm (steps):**

1. Hash every hook and topic with SHA-256 (16-char hex prefix).
2. Filter out hooks whose `hookHash` appears in `recentSignatures` within 14 days.
3. Filter out topics whose `topicHash` appears within 7 days.
4. If no hooks or topics survive, throw `{ code: 'no_candidates' }`.
5. Score surviving hooks by `estimatedEngagement` (viral=8, high=4, medium=2, low=1).
6. Score surviving topics by `6 - productionDifficulty`; double the score if they match `pillarHint`.
7. Pick the highest-scoring hook and topic (random tie-break).
8. Select a format matching `preferredFormats`, then by platform overlap, then fall back to first.
9. Build `VideoSegment[]` from format structure segments or a generic 5-segment layout.
10. Return `SuggestOutput` with hash signatures for storage.

---

## 4. Mapping `viral-patterns.md` to `ProjectPatterns`

| Markdown section | Field in `ProjectPatterns` |
|---|---|
| `## Hooks` — bullet list of hook texts | `hooks: ParsedHook[]` |
| `## Formats` — lines like `Name (30-60s): description` | `formats: ParsedFormat[]` |
| `## Topics` — bullet list of topic names | `topics: ParsedTopic[]` |
| `## Pacing` — key: value pairs | `pacing: PacingRules` |
| `## Visual Elements` — bullet list | `visualElements: VisualElement[]` |
| `## CTAs` — bullet list | `ctaTemplates: string[]` |
| `## Hashtags` with `### Reels`, `### TikTok`, `### Shorts` sub-sections | `hashtags: HashtagSet` |
| `## Captions` with `### template_name` sub-sections | `captionTemplates: Record<string, string>` |
| Level-1 heading language detection (keywords like `¿`, `é`) | `language: string` |

Hook `type` is auto-detected from text keywords (curiosity words → `curiosity_gap`, shock words → `shock_contrarian`, etc.). Engagement level is also keyword-detected; defaults to `medium`.

Format duration is parsed from parenthesised hints: `(30-60s)` → `{ min: 30, max: 60 }`.

---

## 5. End-to-end example

```
raw viral-patterns.md
        │
        ▼
parser.parsePatterns({ source, mimeType: 'text/markdown', projectId })
        │
        ▼
ProjectPatterns {
  hooks: [...],     // 3 ParsedHook objects
  formats: [...],   // 2 ParsedFormat objects
  topics: [...],    // 3 ParsedTopic objects
  pacing: { ... },
  hashtags: { reels: [...], tiktok: [...], shorts: [...] },
  captionTemplates: { single_tip: '{hook}\n{value}\n{cta}', ... },
}
        │
        ▼
engine.suggest({ patterns, brand, recentSignatures: [] })
        │
        ▼
SuggestOutput {
  hook:    { text: 'Cuántas líneas de código...', type: 'curiosity_gap', ... },
  topic:   { name: 'Automatización de workflows', ... },
  format:  { name: 'Speed Build', optimalDurationSec: { min: 60, max: 90 } },
  structure: [ { role: 'hook', startSec: 0, endSec: 3 }, ... ],
  signature: { hookHash: 'a1b2c3d4...', topicHash: '...', angleHash: '...' },
  rationale: "Selected hook type 'curiosity_gap' (medium engagement) + topic...",
}
        │
        ▼
engine.buildCaption(
  patterns.captionTemplates['single_tip'],
  { hook: output.hook.text, value: 'Your value prop', cta: 'Seguí para más' },
  patterns.hashtags.reels.slice(0, 5)
)
        │
        ▼
"Cuántas líneas de código...\nYour value prop\nSeguí para más\n#programacion #desarrollo #saas"
```

---

## 6. How to add a custom `CaptionTemplate`

`CaptionTemplate` is typed as a union of known string literals plus `string & {}`, so any string key is valid at the type level.

**Step 1 — add the template to your markdown file:**

```markdown
## Captions
### product_demo
🚀 {hook}
{value}
👇 {cta}
```

**Step 2 — use it after parsing:**

```ts
import { engine } from '@virus/shared/viral';

const template = patterns.captionTemplates['product_demo'];

if (!template) {
  throw new Error('product_demo caption template not found in patterns');
}

const hashtags = engine.pickHashtags(patterns.hashtags, 'reels', 5);

const caption = engine.buildCaption(
  template,
  {
    hook: output.hook.text,
    value: 'Ship in 3 days instead of 3 weeks',
    cta: 'Link in bio',
  },
  hashtags
);
```

Templates support three placeholders: `{hook}`, `{value}`, `{cta}`. Any text outside those placeholders is rendered verbatim — emoji, line breaks, arrow characters all pass through unchanged.

`pickHashtags(set, platform, count)` selects the first `count` hashtags from the given platform set — call it before `buildCaption` and pass the array directly.
