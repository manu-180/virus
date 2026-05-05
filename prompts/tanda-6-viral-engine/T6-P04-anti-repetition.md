---
modelo: opus-4.7-1M
modelo-id: claude-opus-4-7[1m]
agente: ai-engineer
tanda: 6
depende-de: [T1-P02, T1-P04, T2-P07]
file-ownership:
  - apps/worker/src/functions/anti-repeat-query.ts
  - apps/worker/src/functions/anti-repeat-persist.ts
  - apps/worker/src/functions/anti-repeat-similarity.ts
  - apps/worker/src/functions/anti-repeat-policy.ts
  - apps/worker/src/functions/anti-repeat-tests/
  - packages/shared/src/viral/engine/anti-repeat-policy.ts
duracion-estimada: 75 min
---

# T6-P04 — Anti-repetición por proyecto (con similitud semántica)

## Por qué Opus 4.7 1M

Razonamiento sobre similitud semántica + escalabilidad. Vas a diseñar un sistema que evita repetir hooks/topics/ángulos por proyecto a corto plazo (ventana 14d) y semánticamente similares a mediano plazo (90d). Necesitás cargar `viral/engine/`, schema completo, ejemplos de hooks reales y razonar sobre falsos positivos/negativos.

## Contexto

Cada proyecto tiene su propia "memoria" de qué generó. Necesitamos:

1. Filtro **hard** por hash exacto (rápido, ya lo hace `engine.antiRepeat()` de T1-P04).
2. Filtro **soft** por similitud semántica (evita "Tu MVP no necesita Auth0" y "No uses Auth0 en tu MVP" en la misma semana). Sonnet 4.6 con prompt caching del set reciente.
3. Política configurable por proyecto (ventanas, agresividad).
4. Persistencia de signatures + tests determinísticos.

Lee primero:
- `packages/shared/src/viral/engine/hashing.ts` y `anti-repeat.ts` (T1-P04).
- `packages/db/migrations/0001_init.sql` — tabla `project_used_signatures` (T1-P02).
- `apps/web/src/lib/claude/cache.ts` (T2-P03) — prompt caching.

## Tarea

### 1. `anti-repeat-query.ts`

```ts
export interface RecentSignature {
  hookHash: string;
  topicHash: string;
  angleHash: string;
  hookText: string;       // texto crudo para similarity check
  topicName: string;
  format: string;
  usedAt: string;
}

export async function getRecentSignatures(input: {
  projectId: string;
  windowDays?: number;    // default 14
}): Promise<RecentSignature[]>;
```

Query optimizada con index `(project_id, used_at DESC)`.

### 2. `anti-repeat-persist.ts`

```ts
export async function persistSignature(input: {
  projectId: string;
  videoId: string;
  hookHash: string;
  topicHash: string;
  angleHash: string;
  hookText: string;
  topicName: string;
  format: string;
}): Promise<void>;
```

Idempotente por `video_id` (UPSERT con conflicto ignorado).

### 3. `anti-repeat-similarity.ts`

```ts
export async function findSemanticDuplicates(input: {
  candidate: { hook: string; topic: string };
  recent: RecentSignature[];
  threshold?: number;     // 0.0 .. 1.0, default 0.85
}): Promise<{ isDuplicate: boolean; matches: Array<{ recent: RecentSignature; similarity: number; reason: string }> }>;
```

Implementación:
- Si `recent.length === 0`: retorna `{ isDuplicate: false }`.
- Llama a Claude Sonnet 4.6 con prompt cacheado:
  > "Dado este hook candidato y N hooks recientes, devolvé JSON con ratio de similitud semántica para cada uno (0-1) y reason corta. No considerés similar dos hooks que solo comparten palabras genéricas."
- Si algún match supera `threshold`, marca como duplicado.
- Usa **prompt caching** sobre `recent` (rota cada cierto tiempo, alta hit rate).
- Costo objetivo: <$0.005 por check.

Fallback: si Claude falla, retorna `{ isDuplicate: false }` (no bloquear generación por error de similitud).

### 4. `anti-repeat-policy.ts` (worker) y `viral/engine/anti-repeat-policy.ts` (shared)

```ts
export interface AntiRepeatPolicy {
  hashWindowDays: { hook: number; topic: number; angle: number };
  similarityWindowDays: number;
  similarityThreshold: number;
  maxAttempts: number;     // intentos antes de aceptar similar
  fallback: 'force' | 'fail';   // si después de N intentos sigue duplicado
}

export const DEFAULT_POLICY: AntiRepeatPolicy = {
  hashWindowDays: { hook: 14, topic: 7, angle: 21 },
  similarityWindowDays: 30,
  similarityThreshold: 0.85,
  maxAttempts: 3,
  fallback: 'force',
};

export function getProjectPolicy(project: Project): AntiRepeatPolicy {
  // Permite override per-project en projects.metadata.anti_repeat_policy
  return { ...DEFAULT_POLICY, ...(project.metadata?.anti_repeat_policy ?? {}) };
}
```

### 5. Loop de re-suggest en orchestrator

Helper que el orchestrator (T5-P05) usa:

```ts
export async function suggestWithAntiRepeat(input: {
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  projectId: string;
  policy: AntiRepeatPolicy;
}): Promise<SuggestOutput | { ok: false; error: 'no_candidates' }> {
  const recent = await getRecentSignatures({ projectId, windowDays: input.policy.similarityWindowDays });
  for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt++) {
    const candidate = engine.suggest({ patterns: input.patterns, brand: input.brand, recentSignatures: recent });
    if (!candidate) return { ok: false, error: 'no_candidates' };

    const sim = await findSemanticDuplicates({
      candidate: { hook: candidate.hook.text, topic: candidate.topic.name },
      recent,
      threshold: input.policy.similarityThreshold,
    });
    if (!sim.isDuplicate) return candidate;

    // Marca este candidato como visto y retry (engine.suggest con randomización pondera otros)
  }

  if (input.policy.fallback === 'force') {
    return engine.suggest({ patterns: input.patterns, brand: input.brand, recentSignatures: recent });
  }
  return { ok: false, error: 'no_candidates' };
}
```

### 6. Tests

```ts
describe('anti-repeat', () => {
  it('hash filter blocks exact reuse within 14d', () => { ... });
  it('semantic filter blocks rewordings within 30d', async () => {
    const recent = [{ hookText: 'Tu MVP no necesita Auth0', /* ... */ }];
    const candidate = { hook: 'No uses Auth0 en tu MVP', topic: 'auth' };
    const sim = await findSemanticDuplicates({ candidate, recent });
    expect(sim.isDuplicate).toBe(true);
  });
  it('different topics same wording: not duplicate', async () => { ... });
  it('after maxAttempts with fallback=force, returns a candidate', async () => { ... });
});
```

Mocks de Claude para tests determinísticos.

## Reglas

- **Performance**: query de signatures <50ms. Similarity check <500ms.
- **Costo**: similarity uno por generación, <$0.005 con prompt caching.
- **Tolerancia a fallos**: si la API de Claude para similarity está down, NO bloquear la generación (fallback a hash-only).
- **Métricas**: log en `job_events` cuántos intentos tomó + si hubo similarity hits.

## Qué NO hagas

- NO uses embeddings/vector store. Es overkill para este volumen. Si en el futuro hace falta, migrar a pgvector como tarea separada.
- NO toques `engine.suggest()` base — extendelo desde fuera con el wrapper.
- NO toques UI.

## Output esperado

Sistema de anti-repetición robusto, configurable por proyecto, con dos capas (hash + semántica). Tests pasan. El orchestrator T5-P05 lo consume vía `suggestWithAntiRepeat()`.

## Verificación

```bash
cd apps/worker
pnpm test src/functions/anti-repeat-tests/
```

Manual: generar 5 videos seguidos en APEX-dev, observar que ninguno repite hook/topic/ángulo. Generar el 30avo video → si quedan candidatos, lo genera; si no, fallback `force` lo permite con warning.
