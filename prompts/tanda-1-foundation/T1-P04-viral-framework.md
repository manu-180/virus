---
modelo: opus-4.7-1M
modelo-id: claude-opus-4-7[1m]
agente: ai-engineer
tanda: 1
depende-de: []
file-ownership:
  - packages/shared/src/viral/
  - packages/shared/src/viral/types.ts
  - packages/shared/src/viral/engine/
  - packages/shared/src/viral/engine/index.ts
  - packages/shared/src/viral/engine/suggest.ts
  - packages/shared/src/viral/engine/score.ts
  - packages/shared/src/viral/engine/anti-repeat.ts
  - packages/shared/src/viral/engine/captions.ts
  - packages/shared/src/viral/engine/hashing.ts
  - packages/shared/src/viral/parser/
  - packages/shared/src/viral/parser/index.ts
  - packages/shared/src/viral/parser/markdown.ts
  - packages/shared/src/viral/parser/json.ts
  - packages/shared/src/viral/parser/normalize.ts
  - packages/shared/src/viral/parser/zod-schemas.ts
  - packages/shared/src/viral/index.ts
  - packages/shared/src/viral/README.md
duracion-estimada: 90 min
---

# T1-P04 — Motor genérico de patrones virales (data-driven, multi-nicho)

## Por qué Opus 4.7 con contexto 1M

Vas a cargar `proyecto.md` (~30K tokens), `00-ARCHITECTURE.md` (~12K), tipos del proyecto y producir una librería que es la **fuente de verdad del sistema**. Necesitás razonamiento de alta calidad para diseñar un motor genérico que sirva para cualquier nicho (no solo dev), y para que el resto de la app dependa de tipos sólidos.

## Contexto

Virus genera videos virales para **N proyectos**, cada uno con su propio nicho. Cada proyecto sube un archivo `viral-patterns.{md|json|pdf}` describiendo qué hace virales a los videos de ese tema. Tu trabajo es construir el **motor genérico** que:

1. Define los **tipos** que cualquier `viral-patterns` debe satisfacer.
2. Provee **parsers** que convierten archivos crudos a esa forma tipada.
3. Provee **utilidades** que el orchestrator usa: `suggest()`, `score()`, `antiRepeat()`, `buildCaption()`, `hashSignature()`.

**Importantísimo**: este package NO contiene data hardcoded de un nicho específico. La data del proyecto seed APEX-dev se carga en T1-P08 a Supabase + se proveen helpers de seeds en `viral/seeds/` (creados ahí, no acá).

Lee con cuidado:
- `proyecto.md` — completo, todas las 8 secciones (sirve como ejemplo de input para entender qué debe parsear el sistema).
- `prompts/00-ARCHITECTURE.md` — sección "Concepto: Proyecto" para los tipos `ProjectPatterns` y `ProjectBrand`.

## Tarea

Construir `@virus/shared/viral`, un package TS puro que expone tipos + parser + engine.

### Archivos a producir

#### `viral/types.ts` — tipos canónicos

```ts
// ----------- HOOKS -----------
export type HookType =
  | 'curiosity_gap'
  | 'shame_relief'
  | 'shock_contrarian'
  | 'immediate_value'
  | 'fomo'
  | 'identity_insider'
  | 'speed_build_demo'
  | 'storytelling';

export type HookEngagement = 'low' | 'medium' | 'high' | 'viral';
export type HookPlatform = 'reels' | 'tiktok' | 'shorts';

export interface ParsedHook {
  id: string;             // estable: hash(text) o id provisto
  text: string;
  textEnglish?: string;
  type: HookType;
  estimatedEngagement: HookEngagement;
  bestPlatforms: HookPlatform[];
  exampleTopics: string[];
  notes?: string;
  language: string;
}

// ----------- FORMATS -----------
export interface ParsedFormat {
  id: string;
  name: string;
  description: string;
  optimalDurationSec: { min: number; max: number };
  bestPlatforms: HookPlatform[];
  realExample?: string;
  structureSegments: string[];   // ej: ['hook 0-2s', 'setup 2-6s', ...]
}

// ----------- PACING -----------
export interface PacingRules {
  audioSpeedMultiplier: { min: number; max: number };
  cutEverySec: { min: number; max: number };
  ideaDensitySec: number;
  musicBpm: { min: number; max: number };
  voiceLufs: number;
  musicLufs: number;
  duckingDb: number;
}

// ----------- VISUAL ELEMENTS -----------
export interface VisualElement {
  name: string;
  retentionLift: number;
  notes?: string;
}

// ----------- CAPTIONS / HASHTAGS -----------
export type CaptionTemplate =
  | 'single_tip'
  | 'hot_take'
  | 'speed_build'
  | 'listicle'
  | 'story_horror'
  | 'product_demo'
  | string;       // permitir custom por proyecto

export interface CaptionStructure {
  hook: string;            // línea 1, max 80 chars
  value: string;           // línea 2-3
  cta: string;             // línea 4
  hashtags: string[];
}

export interface HashtagSet {
  reels: string[];
  tiktok: string[];
  shorts: string[];
}

// ----------- TOPIC -----------
export interface ParsedTopic {
  id: string;
  name: string;
  category: string;            // libre — depende del nicho
  dominantEmotion: string;
  productionDifficulty: 1 | 2 | 3 | 4 | 5;
  trendingUntil?: string;
  relatedHookIds: string[];
}

// ----------- PROJECT PATTERNS (lo que se guarda en project_patterns) -----------
export interface ProjectPatterns {
  projectId: string;
  hooks: ParsedHook[];
  formats: ParsedFormat[];
  topics: ParsedTopic[];
  pacing: PacingRules;
  visualElements: VisualElement[];
  ctaTemplates: string[];
  hashtags: HashtagSet;
  captionTemplates: Record<CaptionTemplate, string>;  // template strings con {placeholders}
  language: string;
  parsedAt: string;
  rawSource?: string;
}

// ----------- PROJECT BRAND -----------
export interface ProjectBrand {
  projectId: string;
  brandName: string;
  oneLiner: string;
  audience: { who: string; where: string; pains: string[] };
  valueProps: string[];
  features: string[];
  caseStudies: { title: string; metric: string }[];
  voiceTone: string;
  ctas: { kind: string; value: string }[];
  doNotSay: string[];
  parsedAt: string;
}

// ----------- VIDEO STRUCTURE -----------
export interface VideoSegment {
  startSec: number;
  endSec: number;
  role: 'hook' | 'setup' | 'development' | 'mini_payoff' | 'reveal' | 'cta';
  description: string;
}

// ----------- SUGGEST INPUT/OUTPUT -----------
export interface SuggestInput {
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  recentSignatures: { hookHash: string; topicHash: string; angleHash: string; usedAt: string }[];
  windowDays?: number;          // default 14
  preferredFormats?: string[];  // ids
  pillarHint?: string;
}

export interface SuggestOutput {
  hook: ParsedHook;
  topic: ParsedTopic;
  format: ParsedFormat;
  structure: VideoSegment[];
  signature: { hookHash: string; topicHash: string; angleHash: string };
  rationale: string;
}
```

#### `viral/parser/` — parsers de archivos crudos

- **`zod-schemas.ts`**: schemas Zod estrictos para `ProjectPatterns` y `ProjectBrand`. Útil para validar parseos.
- **`markdown.ts`**: parser de markdown estructurado. Detecta headings (`## Hooks`, `## Formatos`, etc.) y extrae listas. Tolerante a variaciones de naming.
- **`json.ts`**: parser de JSON directo, validado con Zod.
- **`normalize.ts`**: toma input crudo (md/json) y devuelve `ProjectPatterns | ProjectBrand` normalizado. Llena defaults sensatos cuando faltan campos no críticos. Falla si faltan campos críticos (hooks, formatos para patterns; brandName, oneLiner para brand).

PDF e imágenes NO los procesás acá — el package del worker (T2-P09) hace pdf-parse + Claude Vision y luego llama a `parseFromMarkdown()` o `parseFromJson()` con el resultado.

```ts
// Public API esperada del parser
export function parsePatterns(input: { source: string; mimeType: string; projectId: string }): {
  ok: true; data: ProjectPatterns;
} | { ok: false; error: string; partial?: Partial<ProjectPatterns> };

export function parseBrand(input: { source: string; mimeType: string; projectId: string }): {
  ok: true; data: ProjectBrand;
} | { ok: false; error: string; partial?: Partial<ProjectBrand> };
```

#### `viral/engine/` — utilidades puras

- **`hashing.ts`**: funciones determinísticas para `hashHook(text)`, `hashTopic(name)`, `hashAngle(text)` (sha256, hex, primeros 16 chars). NO usa crypto de Node — usa Web Crypto API o subtle-compat para que corra en Edge runtime.
- **`anti-repeat.ts`**: dado `recentSignatures` y un candidato `(hook,topic,angle)`, retorna `boolean` si pasa filtro. Reglas:
  - hookHash no puede aparecer en últimos 14 días
  - topicHash no puede aparecer en últimos 7 días
  - angleHash no puede aparecer en últimos 21 días
  - configurables vía `windowDays` con overrides por tipo
- **`suggest.ts`**: implementa `suggest(input: SuggestInput): SuggestOutput`. Algoritmo:
  1. Filtrar hooks/topics que pasen `anti-repeat`.
  2. Ponderar por `estimatedEngagement` y `productionDifficulty`.
  3. Seleccionar formato compatible con el hook elegido.
  4. Calcular structure por duración esperada.
  5. Devolver con rationale legible.
- **`score.ts`**: opcional — scorer para feedback loop (T6-P03). Toma `videoPerformance` y deriva `hookScoreDelta`, `topicScoreDelta`. Lo dejás como interfaz pública aunque la implementación full la haga T6-P03.
- **`captions.ts`**: `buildCaption(template, data, platform, hashtags) → string`. Toma `captionTemplates[template]` con placeholders `{hook}`, `{value}`, `{cta}` y los reemplaza. `pickHashtags(set, platform, count)` selecciona N hashtags del set correspondiente.

#### `viral/index.ts`

```ts
export * from './types';
export * as parser from './parser';
export * as engine from './engine';
```

#### `viral/README.md`

Documentá:
- Cómo se usa `parsePatterns` y `parseBrand` desde el worker de Inngest.
- Cómo invoca `suggest()` el orchestrator.
- Cómo se mapea un archivo `viral-patterns.md` típico a `ProjectPatterns`.
- Ejemplo end-to-end: archivo crudo → parseo → suggest → output.
- Cómo agregar un nuevo `CaptionTemplate` custom para un proyecto.

## Reglas de calidad

- **Cero data hardcoded de nicho específico** (ni los 30 hooks de dev, ni los 25 topics). Esos viven en T1-P08 (seed) y en archivos de proyecto.
- **Tipos exhaustivos**: usá unions discriminados.
- **Documentación inline**: cada función exportada con JSDoc.
- **Sin dependencias externas pesadas**: TS puro. Zod sí (validación). Web Crypto sí (hash).
- **Tests con Vitest** (obligatorio en este prompt): cubrí `parsePatterns` con 3 fixtures (md válido, md con campos faltantes, json válido), `suggest()` con anti-repeat, `hashing` determinístico.

## Qué NO hagas

- NO incluyas los 30 hooks ni los 25 topics como código (eso es seed en T1-P08).
- NO conectes con Claude API ni nada externo (eso es T2-P03 y T2-P09).
- NO toques otros packages.
- NO uses Node-only crypto (`crypto.createHash`); usá `globalThis.crypto.subtle`.

## Output esperado

Package `@virus/shared/viral` 100% tipado y con tests pasando. El motor es **agnóstico al nicho**: sirve igual para proyectos de dev, chatbots, educación, fitness, lo que sea. Listo para que T2-P03, T2-P09 y T5-P05 lo importen.

## Verificación

```bash
cd packages/shared
pnpm test viral/
pnpm typecheck
```

Tests deben pasar. `parsePatterns` con un fixture markdown bien formado debe devolver `ProjectPatterns` válido. `suggest()` con `recentSignatures` que cubren todos los hooks debe devolver `error: 'no_candidates'` (graceful).
