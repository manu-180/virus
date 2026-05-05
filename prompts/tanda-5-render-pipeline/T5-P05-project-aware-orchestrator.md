---
modelo: opus-4.7-1M
modelo-id: claude-opus-4-7[1m]
agente: backend-architect
tanda: 5
depende-de: [T5-P02, T2-P08, T2-P09, T6-P04]
file-ownership:
  - apps/web/src/server/generate/
  - apps/web/src/server/generate/index.ts
  - apps/web/src/server/generate/trigger.ts
  - apps/web/src/server/generate/load-context.ts
  - apps/web/src/app/api/generate/route.ts
  - apps/worker/src/functions/generate-video-project-aware.ts
duracion-estimada: 90 min
---

# T5-P05 — Orchestrator project-aware (one-click generate)

## Por qué Opus 4.7 1M

Vas a integrar T5-P02 (orchestrator base) con T2-P08 (project context), T2-P09 (parsed patterns), T6-P04 (anti-repetición) y disparar todo desde un único endpoint `/api/generate`. Necesitás cargar simultáneamente: arquitectura, schema, types de viral engine, código de T5-P02 y T6-P04 — y razonar sobre cómo encajan sin romper invariantes. Contexto 1M permite tener todo a mano.

## Contexto

El botón "Generar video" en `/projects/[slug]` (T4-P10) llama a `POST /api/generate` con `{ projectId }`. Este prompt construye:

1. El endpoint `POST /api/generate` que valida + dispara.
2. El **load-context** que arma el payload completo del proyecto.
3. La integración con la `generateVideo` Inngest function (T5-P02) extendida para usar contexto de proyecto.
4. Anti-repetición consultada vía `engine.antiRepeat()` con signatures de los últimos 14d (T6-P04).

Lee primero:
- `apps/worker/src/functions/generate-video.ts` (T5-P02) — orchestrator base.
- `apps/web/src/server/projects/queries.ts` (T2-P08) — `fetchProjectFull()`.
- `apps/worker/src/functions/anti-repeat-query.ts` (T6-P04) — query de signatures recientes.
- `packages/shared/src/viral/engine/suggest.ts` (T1-P04).

## Tarea

### 1. `apps/web/src/app/api/generate/route.ts`

```ts
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { projectId } = await req.json();

  // Validate ownership
  const project = await fetchProjectShallow(projectId, user.id);
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Rate limit (T5-P04)
  const rl = await checkRateLimit({ userId: user.id, projectId });
  if (!rl.ok) return NextResponse.json({ error: 'rate_limit', retryAfter: rl.retryAfter }, { status: 429 });

  // Pre-flight: check parsed patterns + brand
  const ctx = await loadGenerationContext(projectId);
  if (!ctx.patterns || !ctx.brand) {
    return NextResponse.json({ error: 'project_incomplete', detail: 'Subí los archivos de patrones y marca antes de generar.' }, { status: 412 });
  }

  // Create video row in 'pending'
  const video = await createPendingVideo({ projectId, userId: user.id });

  // Dispatch Inngest event
  await inngest.send({
    name: 'video.generate.requested',
    data: { videoId: video.id, projectId, userId: user.id },
  });

  return NextResponse.json({ ok: true, videoId: video.id }, { status: 202 });
}
```

### 2. `server/generate/load-context.ts`

```ts
export interface GenerationContext {
  project: Project;
  patterns: ProjectPatterns;
  brand: ProjectBrand;
  recentSignatures: RecentSignature[];     // últimos 14d
  voiceCloneId: string;
  themeColor: string;
}

export async function loadGenerationContext(projectId: string): Promise<GenerationContext>;
```

Carga en una sola query (con joins) todo lo que el orchestrator necesita.

### 3. `apps/worker/src/functions/generate-video-project-aware.ts`

Esta función **extiende** o **reemplaza** la base de T5-P02 para recibir `projectId` en lugar de inputs hardcoded. Usa `loadGenerationContext()` y luego invoca `engine.suggest()`:

```ts
export const generateVideoProjectAware = inngest.createFunction(
  { id: 'generate-video', retries: 2, concurrency: { limit: 3, key: 'event.data.userId' } },
  { event: 'video.generate.requested' },
  async ({ event, step }) => {
    const { videoId, projectId } = event.data;

    // 1. Load context
    const ctx = await step.run('load-context', () => loadGenerationContext(projectId));

    // 2. Suggest idea (anti-repeat aplicado)
    const suggestion = await step.run('suggest', () => engine.suggest({
      patterns: ctx.patterns,
      brand: ctx.brand,
      recentSignatures: ctx.recentSignatures,
      windowDays: 14,
    }));
    if (!suggestion) {
      await markVideoFailed(videoId, 'no_candidates');
      throw new Error('no_candidates_left');
    }
    await updateVideoStatus(videoId, 'scripting', { idea: suggestion });

    // 3. Script writer (Claude Sonnet 4.6) — usa patterns + brand + suggestion
    const script = await step.run('script', () => writeScript({ suggestion, ctx }));
    await updateVideoStatus(videoId, 'audio', { script });

    // 4-9. Audio, captions, render, captions Instagram, persist signature, realtime emit.
    //   Reusar steps de T5-P02 cuando aplique. Cambios clave:
    //   - voiceCloneId viene de ctx.project (override) o ctx.profile.default
    //   - themeColor viene de ctx.project.theme_color
    //   - hashtags vienen de ctx.patterns.hashtags
    //   - cta templates de ctx.patterns.ctaTemplates + ctx.brand.ctas
    //   - paso final: persistir signatures en project_used_signatures (T6-P04)

    await step.run('persist-signature', () => persistSignature({
      projectId,
      hookHash: suggestion.signature.hookHash,
      topicHash: suggestion.signature.topicHash,
      angleHash: suggestion.signature.angleHash,
      format: suggestion.format.id,
    }));

    await updateVideoStatus(videoId, 'ready');
    await emitRealtime(`project:${projectId}`, { kind: 'video.ready', videoId });
  },
);
```

### 4. Backwards compat con T5-P02

Si T5-P02 ya tiene `generateVideo` corriendo con otra firma de evento, **no la reemplaces**. En lugar:
- Esta función nueva escucha `video.generate.requested` (project-aware).
- La de T5-P02 sigue escuchando `video.generate.legacy` o se deprecia limpia.
- Documentá la migración en un comment al tope del archivo.

## Reglas

- **Idempotente**: Inngest reintenta steps. `persistSignature` debe ser idempotente (UPSERT por video_id).
- **Failure granular**: cada step tiene su error tag (`step:audio:elevenlabs_429`, `step:render:lambda_timeout`). El UI los muestra.
- **Realtime**: emite eventos en CADA cambio de status para que `<GenerationProgress>` se actualice en vivo.
- **Costos**: log en `job_events` el costo por step (tokens Claude, chars ElevenLabs, segundos Lambda) para tracking en T7.

## Qué NO hagas

- NO toques el rate limiter (T5-P04) ni Realtime channels base (T5-P03).
- NO refactorices T5-P02 — extendé.
- NO toques UI (T4-P10).

## Output esperado

Endpoint `/api/generate` funcional. Click "Generar" → en 2-4 min un video aparece `ready` con caption pre-armado. Si el proyecto no está configurado, error legible 412. Si rate-limited, 429 con retryAfter.

## Verificación

E2E con stubs en ElevenLabs/Lambda/Claude:
1. POST `/api/generate` con projectId APEX-dev → 202 + videoId.
2. Subscribe Realtime `project:apex-dev` → ver eventos `scripting → audio → captions → rendering → ready` en orden.
3. Tras "ready" → fila en `videos` con `caption_instagram`, `caption_tiktok`, `caption_shorts`, `hashtags`, `video_url`.
4. Row en `project_used_signatures` con los 3 hashes.
5. Segundo POST inmediato → suggest debe evitar mismos hashes.
