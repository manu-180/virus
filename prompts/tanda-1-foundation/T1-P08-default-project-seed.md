---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: ai-engineer
tanda: 1
depende-de: []
file-ownership:
  - packages/shared/src/viral/seeds/
  - packages/shared/src/viral/seeds/index.ts
  - packages/shared/src/viral/seeds/apex-dev/
  - packages/shared/src/viral/seeds/apex-dev/patterns.json
  - packages/shared/src/viral/seeds/apex-dev/brand.json
  - packages/shared/src/viral/seeds/apex-dev/README.md
  - packages/shared/src/viral/seeds/apex-dev/sample-patterns.md
  - packages/shared/src/viral/seeds/apex-dev/sample-brand.md
duracion-estimada: 60 min
---

# T1-P08 — Seed del proyecto default "APEX-dev"

## Contexto

El sistema Virus es multi-proyecto. Para que Manuel pueda probar el botón "Generar" desde el día 1 sin escribir nada, el sistema viene con un **proyecto seed preconfigurado** llamado `apex-dev` que contiene:

1. Un `patterns.json` con la estructura `ProjectPatterns` derivada de `proyecto.md` (los 30 hooks + 15 formatos + 25 topics + reglas de pacing).
2. Un `brand.json` con la estructura `ProjectBrand` derivada de `ANALISIS.md` (info de APEX como caso real).
3. Versiones markdown originales (`sample-patterns.md`, `sample-brand.md`) que sirven como **plantilla descargable** para cualquier nuevo proyecto que cree Manuel.

T2-P08 (project CRUD) llama a `getApexDevSeed()` durante el onboarding del primer login para crear el proyecto inicial.

NO cargues estos JSONs en la base. Solo dejalos como **assets versionados en código** que el seeder de la app consume.

Lee primero:
- `proyecto.md` — research de virales completo. Es la fuente del seed.
- `C:\MisProyectos\APEX\APEX_next\ANALISIS.md` — info de marca de APEX. Es la fuente del brand seed.
- `packages/shared/src/viral/types.ts` (creado por T1-P04) — los tipos `ProjectPatterns` y `ProjectBrand` que tenés que respetar.

## Tarea

### 1. `apex-dev/patterns.json`

Estructura `ProjectPatterns` con:
- **30 hooks** de proyecto.md §3 con `id` estable (`h-001` a `h-030`), `text`, `type` clasificado (curiosity_gap/shame_relief/etc), `estimatedEngagement` (medium/high/viral), `bestPlatforms`, `exampleTopics: 2-4 por hook` (vos los inferís).
- **15 formatos** de proyecto.md §4 con `optimalDurationSec`, `bestPlatforms`, `realExample`, `structureSegments`.
- **25 topics** de proyecto.md §5 con `category`, `dominantEmotion`, `productionDifficulty`, `relatedHookIds`.
- **`pacing`**: cutEverySec 3-5, ideaDensitySec 4, audioSpeedMultiplier 1.1-1.3, etc. (proyecto.md §2).
- **`visualElements`**: captions_on (lift 0.12), code_highlight (0.08), counter_animated (0.06), etc.
- **`ctaTemplates`**: ej "comentá CODIGO", "link en bio", "guardalo para después".
- **`hashtags`**: `reels` (8-12), `tiktok` (3-5), `shorts` (3) con sets dev-friendly (`#programming`, `#coding`, `#javascript`, `#nextjs`, etc.).
- **`captionTemplates`**: 6 plantillas (single_tip, hot_take, speed_build, listicle, story_horror, product_demo) con placeholders `{hook}`, `{value}`, `{cta}`, `{hashtags}`.
- **`language`**: `es-AR`.
- **`projectId`**: `'__seed_apex_dev__'` (placeholder reemplazable al instanciar).

### 2. `apex-dev/brand.json`

Estructura `ProjectBrand` con:
- `brandName`: "APEX"
- `oneLiner`: "Estudio de desarrollo de apps Flutter y webs Next.js en Argentina"
- `audience.who`: "Founders LATAM 25-45 con MVP validado"
- `audience.where`: "Argentina, Uruguay, Chile, México"
- `audience.pains`: ["devs no responden", "presupuestos inflados", "MVPs que no escalan", ...]
- `valueProps`: ["delivery en semanas no meses", "stack moderno (Flutter/Next/Supabase)", "seniority real, no juniors disfrazados", ...]
- `features`: lista de servicios (apps Flutter, webs Next.js, chatbots WhatsApp, integraciones Supabase, ...)
- `caseStudies`: 2-4 casos reales basados en proyectos de Manuel (Oficios App, FrostMint, Assistify si aplica). Si ANALISIS.md no los tiene completos, dejá placeholders evidentes.
- `voiceTone`: "Directo, sin BS, técnico pero accesible. Energía contrarian cuando es warranted."
- `ctas`: [{kind:"whatsapp", value:"+54 9 11 ..."}, {kind:"web", value:"apex-dev.com/cotizar"}, ...]
- `doNotSay`: ["barato", "rápido y fácil", "promesas vacías", ...] (anti-patrones de marca)
- `parsedAt`: ISO timestamp.
- `projectId`: `'__seed_apex_dev__'`.

### 3. `apex-dev/sample-patterns.md` y `apex-dev/sample-brand.md`

Las **versiones markdown originales** legibles por humanos que Manuel puede:
- Descargar desde la UI como plantilla.
- Editar a mano y re-subir.
- Compartir con clientes para que armen su propio archivo.

Estos markdowns deben ser **idempotentes con el JSON**: parsearlos con `parsePatterns()` (T1-P04) debe producir un objeto equivalente al `patterns.json`. Eso lo verificamos en tests.

### 4. `apex-dev/README.md`

Documentá:
- Origen de cada sección (qué línea de proyecto.md/ANALISIS.md la generó).
- Cómo regenerar el seed si se actualiza la research.
- Disclaimer: este seed sirve como ejemplo y como fallback. El proyecto real de APEX puede divergir.

### 5. `seeds/index.ts`

```ts
import patternsJson from './apex-dev/patterns.json';
import brandJson from './apex-dev/brand.json';
import samplePatternsMd from './apex-dev/sample-patterns.md?raw';
import sampleBrandMd from './apex-dev/sample-brand.md?raw';
import type { ProjectPatterns, ProjectBrand } from '../types';

export interface SeedProject {
  slug: string;
  name: string;
  niche: string;
  language: string;
  themeColor: string;
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  samplePatternsMarkdown: string;
  sampleBrandMarkdown: string;
}

export const SEED_APEX_DEV: SeedProject = {
  slug: 'apex-dev',
  name: 'APEX — Servicios de software',
  niche: 'dev/software',
  language: 'es-AR',
  themeColor: '#3ECF8E',
  patterns: patternsJson as ProjectPatterns,
  brand: brandJson as ProjectBrand,
  samplePatternsMarkdown: samplePatternsMd,
  sampleBrandMarkdown: sampleBrandMd,
};

export const ALL_SEEDS: SeedProject[] = [SEED_APEX_DEV];

export function getSeedBySlug(slug: string): SeedProject | undefined {
  return ALL_SEEDS.find((s) => s.slug === slug);
}
```

## Reglas de calidad

- JSONs **válidos contra Zod schemas** de `parser/zod-schemas.ts` (creado por T1-P04). Si T1-P04 todavía no terminó cuando vos arrancás, importá el schema esperado por interfaces y validá manualmente con `JSON.parse + structural check`.
- Markdowns idempotentes: `parsePatterns(samplePatternsMd)` debe devolver objeto equivalente a `patternsJson`. Test obligatorio.
- Cero placeholders `TODO` en JSON final — completá todos los campos.
- En markdown, los headings deben ser EXACTAMENTE los que el parser espera (`## Hooks`, `## Formatos`, `## Topics`, `## Pacing`, `## Visual elements`, `## CTAs`, `## Hashtags`, `## Caption templates`).

## Qué NO hagas

- NO insertes el seed en Supabase. Eso lo hace T2-P08 al primer login.
- NO toques `viral/types.ts` ni `viral/parser/` ni `viral/engine/` (eso es de T1-P04).
- NO crees seeds de otros nichos. Solo `apex-dev`. Otros nichos los carga Manuel manualmente.

## Output esperado

Carpeta `packages/shared/src/viral/seeds/apex-dev/` con 5 archivos. `seeds/index.ts` exporta `SEED_APEX_DEV`. El JSON valida contra el Zod schema. El sample-patterns.md parsea idempotentemente al JSON.

## Verificación

```bash
cd packages/shared
pnpm test viral/seeds/
pnpm typecheck
```

Test obligatorio:
```ts
import { parsePatterns } from '@virus/shared/viral/parser';
import { SEED_APEX_DEV } from '@virus/shared/viral/seeds';

it('sample-patterns.md parsea idempotente al JSON', () => {
  const result = parsePatterns({
    source: SEED_APEX_DEV.samplePatternsMarkdown,
    mimeType: 'text/markdown',
    projectId: '__seed_apex_dev__',
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.hooks.length).toBe(SEED_APEX_DEV.patterns.hooks.length);
    expect(result.data.formats.length).toBe(SEED_APEX_DEV.patterns.formats.length);
  }
});
```
