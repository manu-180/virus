---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: ai-engineer
tanda: 2
depende-de: [T1-P04]
file-ownership:
  - packages/shared/src/ai/
  - packages/shared/src/ai/anthropic.ts
  - packages/shared/src/ai/models.ts
  - packages/shared/src/ai/prompts/
  - packages/shared/src/ai/prompts/idea-generator.ts
  - packages/shared/src/ai/prompts/script-writer.ts
  - packages/shared/src/ai/prompts/caption-writer.ts
  - packages/shared/src/ai/prompts/hook-rewriter.ts
  - packages/shared/src/ai/cache.ts
  - packages/shared/src/ai/index.ts
duracion-estimada: 90 min
---

# T2-P03 — Cliente Anthropic + prompts del sistema (idea, script, caption, hook)

## Por qué Opus 4.7

Vas a diseñar **los prompts que escriben los videos**. Esta es la parte más crítica del sistema: si los prompts son malos, todo el output es malo. Necesitás razonamiento de alta calidad para destilar el research de viralidad en system prompts efectivos. Esto lo hacés UNA vez, después corre con Sonnet 4.6 en producción.

## Contexto

Ya existe el framework de viralidad como código (`packages/shared/src/viral/`). Tu tarea es:

1. Setup del cliente Anthropic con caching y retries.
2. Diseñar 4 prompts del sistema (idea, script, caption, hook rewriter).
3. Estructurar la salida con tool use / structured output para que sea parseada con confianza.

Lee:
- `prompts/00-ARCHITECTURE.md`
- `proyecto.md` — completo, especialmente §1 (formatos), §2 (anatomía), §3 (hooks), §4 (audio), §6 (descripciones)
- `packages/shared/src/viral/index.ts` (lo creó T1-P04)

NO uses la skill claude-api — vos sos un agente, no estás usando la API directamente. Pero sí seguí sus best practices: prompt caching, modelos correctos, etc.

## Tarea

### 1. Cliente y modelos (`anthropic.ts`, `models.ts`)

`models.ts`:
```ts
export const MODELS = {
  // Producción diaria — barato, rápido, calidad alta
  default: 'claude-sonnet-4-6',
  // Razonamiento crítico (decisiones de hook/topic con feedback acumulado)
  reasoning: 'claude-opus-4-7',
  // Cuando hace falta cargar todo el histórico de performance
  reasoningLargeContext: 'claude-opus-4-7[1m]',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
```

`anthropic.ts`:
- Cliente singleton con `@anthropic-ai/sdk`.
- Wrapper `callClaude({ model, system, messages, tools, maxTokens })` que:
  - Aplica `cache_control: { type: 'ephemeral' }` al system prompt y a tool definitions (proceso largo, beneficio cache hit).
  - Retries con exponential backoff (3 intentos, 1s/2s/4s) para 429 y 5xx.
  - Telemetría: log con duración, input/output tokens, cache hits.
  - Type-safe: si `tools` está, fuerza `tool_choice` y devuelve el tool input parseado.
- Stream wrapper (`streamClaude`) para casos donde necesitamos streaming (UI live).

### 2. Prompt — Idea Generator (`prompts/idea-generator.ts`)

**Input:**
```ts
{
  pillar: 'educational' | 'hot_take' | 'personal',
  recentHookIds: string[],         // últimos 14 días, no repetir
  language: 'es-AR' | 'en-US',
  performanceFeedback?: {           // opcional, si hay analytics previos
    topPerformingFormats: VideoFormat[];
    avgViews: number;
  };
}
```

**System prompt:** debe contener:
- Rol: "Sos un estratega de contenido viral para devs en Instagram Reels / TikTok / YouTube Shorts".
- Reglas: hook ≤80 chars, sin clickbait sin payoff, evitar repetir hooks usados, tono argentino conversacional.
- Marcos: las 7 emociones (curiosity, shame, shock, value, fomo, identity, story), los 12 formatos.
- Sample examples: 3 ideas excelentes y 3 ideas malas con explicación de por qué.
- Cache-able (es estático).

**Tool/output structure:**
```ts
{
  ideas: Array<{
    hook: string;
    angle: string;
    format: VideoFormat;
    estimatedDurationSec: number;
    targetEmotion: HookType;
    rationale: string;          // por qué este hook funciona ahora
    riskLevel: 'safe' | 'edgy' | 'high-risk';
  }>;
}
```

Output: 5 ideas. Manuel elige 1, el resto queda en el pool.

### 3. Prompt — Script Writer (`prompts/script-writer.ts`)

**Input:**
```ts
{
  idea: { hook, angle, format, estimatedDurationSec, ... };
  language: 'es-AR' | 'en-US';
  voicePersonality?: { tone: string; pace: string; };
}
```

**System prompt:** debe contener:
- Rol: "Sos un guionista de short-form vertical para devs, estilo Fireship + DevelopedByEd, en español argentino".
- Estructura segundo a segundo basada en `proyecto.md §2`:
  - 0-2s: hook visual + hook verbal idéntico.
  - 2-6s: setup mínimo, primer corte.
  - 6-Xs: development (90% del valor), corte cada 3-5s.
  - X-Ys: mini-payoff o cliffhanger.
  - Y-Z: reveal completo.
  - Z-end: CTA + frame loopable.
- Restricciones:
  - 1 idea cada 4 segundos como mínimo.
  - Voz va a ser acelerada 1.15× en post: escribir como conversación normal.
  - Cada segmento ≤25 palabras.
  - Marcar dónde van pattern interrupts (zoom, color flash, sound effect).
- Sample examples: 2 scripts excelentes (uno tipo "tip único", uno tipo "hot take").

**Tool/output structure (JSON estricto):**
```ts
{
  segments: Array<{
    index: number;
    role: 'hook' | 'setup' | 'development' | 'mini_payoff' | 'reveal' | 'cta';
    startSec: number;
    endSec: number;
    voiceover: string;            // texto a narrar (sin markup)
    onScreenText?: string;        // texto en pantalla (puede diferir del voiceover)
    visualCue: string;            // descripción para Remotion: "split screen", "code zoom", "counter 1/5"
    codeSnippet?: { language: string; code: string };
    soundEffect?: 'whoosh' | 'click' | 'ding' | 'glitch' | 'pop' | null;
  }>;
  totalDurationSec: number;
  recommendedTemplate: 'tip' | 'hot_take' | 'speed_build' | 'listicle' | 'story' | 'comparison';
  themeColor: string;             // HEX, sugerido por el agente
  musicMood: 'lofi' | 'synthwave' | 'phonk' | 'cinematic';
}
```

### 4. Prompt — Caption Writer (`prompts/caption-writer.ts`)

**Input:**
```ts
{
  idea, script, language,
  audience: 'latam' | 'global' | 'mixed';
  ctaPreference?: 'comment_keyword' | 'tag_friend' | 'save' | 'follow';
}
```

**System prompt:** basado en `proyecto.md §6`:
- Estructura HVCT (Hook-Value-CTA-Tags).
- Reglas: línea 1 = hook idéntico al video; sin "Hola comunidad..."; 1 sola CTA; keyword principal en caption.
- Hashtags por plataforma:
  - Reels: 8-12, mix de high/medium/niche/latam.
  - TikTok: 3-5 + keywords en texto.
  - Shorts: 3 max.
- Sample examples: 5 captions de las 6 plantillas de proyecto.md.

**Output (3 variantes de caption + hashtags por plataforma):**
```ts
{
  instagram: { caption: string; hashtags: string[] };
  tiktok:    { caption: string; hashtags: string[] };
  shorts:    { caption: string; hashtags: string[] };
}
```

### 5. Prompt — Hook Rewriter (`prompts/hook-rewriter.ts`)

Para iteración: dado un hook que no performó bien, generar 5 variantes más fuertes manteniendo el ángulo. Útil en T6 (feedback loop).

**Input:**
```ts
{ originalHook: string; format: VideoFormat; whyItFailed?: string; }
```

**Output:** 5 variantes con explicación de cada una.

### 6. Cache helper (`cache.ts`)

Wrapper sobre los prompts: tagear secciones cacheables con `cache_control` para que la API de Claude reutilice cómputo. El framework de viralidad (los 30 hooks, los 15 formatos, los 25 topics) es estático y debería estar en cache permanentemente.

### 7. Tests con vitest

Tests para:
- Parser de output del script writer (JSON malformado → error claro).
- Validación de duración (totalDurationSec coincide con suma de segments).
- Hashtags: max 12 en Reels, max 5 en TikTok, max 3 en Shorts.

Mockear el cliente Anthropic con `msw` o stubs.

## Reglas

- **No usar OpenAI ni otros**: solo Anthropic.
- **Tool use** para todos los outputs estructurados (no parseo de JSON dentro de un string).
- **Spanish argentino conversacional** como default.
- Validá con Zod los outputs antes de devolver al caller.

## Output esperado

Package `@virus/shared/ai` listo para consumir desde:
- API routes de `apps/web` (interactivo: Manuel pide 5 ideas).
- Worker de Inngest (batch: generar script de un idea aprobada).

## Verificación

```bash
cd packages/shared
pnpm test ai
# Tests pasan
```

Y un script CLI de prueba (`scripts/try-idea-gen.ts`):
```bash
pnpm tsx packages/shared/scripts/try-idea-gen.ts
# Imprime 5 ideas en consola
```
