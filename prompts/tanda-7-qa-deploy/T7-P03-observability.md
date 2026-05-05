---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: observability-engineer
tanda: 7
depende-de: [T5-P02]
file-ownership:
  - apps/web/sentry.client.config.ts
  - apps/web/sentry.server.config.ts
  - apps/web/sentry.edge.config.ts
  - apps/worker/src/utils/sentry.ts
  - apps/web/instrumentation.ts
  - docs/observability.md
duracion-estimada: 30 min
---

# T7-P03 — Observabilidad (Sentry + PostHog)

## Contexto

Errors en producción y analytics de uso del dashboard. Sin esto, vamos a ciegas.

## Tarea

### 1. Sentry

- `npx @sentry/wizard@latest -i nextjs` ejecutado contra `apps/web`.
- Sentry también en `apps/worker` (manual).
- Sample rate: 0.2 (20%) en prod, 1.0 en dev.
- Filtrar PII (no enviar emails, voiceovers).
- Source maps subidos en build.

### 2. PostHog

- Client init en root layout.
- Eventos clave a trackear:
  - `idea_generated`
  - `idea_approved`
  - `video_render_started`
  - `video_render_completed`
  - `video_published_marked`
  - `caption_copied` (botón "Copiar caption")
  - `voice_clone_completed`
  - `insight_actioned`

- Feature flags básicas (Manuel los puede usar para experimentos).

### 3. Inngest observability

Ya integrada por default. Solo asegurar que los eventos tienen suficiente contexto para debugging.

### 4. Health check endpoint

`apps/web/src/app/api/health/route.ts`:
```ts
export async function GET() {
  const checks = {
    db: await checkSupabase(),
    anthropic: await checkAnthropic(),
    elevenlabs: await checkElevenLabs(),
    lambda: await checkLambda(),
  };
  const ok = Object.values(checks).every(c => c.ok);
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
```

UptimeRobot pinguea cada 5 min.

### 5. Documentación

`docs/observability.md`:
- Cómo investigar un error en Sentry.
- Cómo correlacionar con eventos de Inngest.
- Cómo ver logs de Lambda.
- Dashboards a tener bookmarkeados.

## Output esperado

Visibilidad de errores + uso. Manuel sabe cuando algo se rompe ANTES de que lo sepa el user.
