---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: ai-engineer
tanda: 6
depende-de: [T2-P03]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/lab/
  - apps/web/src/app/api/lab/hook-variants/route.ts
  - packages/shared/src/ai/prompts/hook-evaluator.ts
duracion-estimada: 60 min
---

# T6-P02 — Hook A/B variant generator + evaluator

## Por qué Opus 4.7

Diseñar el sistema de evaluación cualitativa de hooks (qué hace que uno sea mejor que otro) requiere razonamiento. Una vez diseñado, ejecuta con Sonnet en producción.

## Contexto

Manuel a veces tiene una idea pero el hook no le convence. Le damos una herramienta para **iterar 5-10 variantes** y elegir la mejor con scoring automático.

## Tarea

### 1. Prompt evaluador (`prompts/hook-evaluator.ts`)

```ts
export interface HookScore {
  hook: string;
  scores: {
    curiosityGap: number;       // 0-10
    immediateValue: number;
    contrarianPunch: number;
    relatability: number;
    clarity: number;
    overUsedScore: number;      // higher = más visto
  };
  totalScore: number;            // weighted avg
  rationale: string;
  audienceMatch: 'beginner' | 'mid' | 'senior' | 'mixed';
  warnings: string[];            // "clickbait sin payoff", "muy genérico", etc.
}

export async function evaluateHooks(input: {
  hooks: string[];
  context: { format: string; topic: string; audience: string };
}): Promise<HookScore[]>;
```

Sistema prompt: rúbrica detallada basada en proyecto.md §3 + §6. El modelo razona y devuelve scores justificados.

### 2. Variant generator endpoint

```ts
POST /api/lab/hook-variants
{ originalHook, format, topic, count: 8, intensity: 'safe' | 'edgy' | 'rage' }
```

Retorna 8 variantes + scores.

### 3. UI `/dashboard/lab`

Pantalla "playground":
- Input: hook actual.
- Botón "Generar variantes" → 8 variantes.
- Cada variante con su score visualizado (radar chart con las 6 dimensions).
- Botón "Usar este hook" → reemplaza el hook de la idea.

También permite **comparar 2 hooks** lado a lado y ver fortalezas relativas.

## Output esperado

Lab funcional para iterar hooks. Manuel puede pulir su mensaje antes de comprometer recursos a generar el video.
