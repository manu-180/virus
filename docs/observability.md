# Observabilidad — Virus

Stack: **Sentry** (errores + performance) + **PostHog** (analytics de producto) + health check en `/api/health`.

---

## Variables de entorno requeridas

```bash
# Sentry
SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX     # Server-side (Next.js + Worker)
NEXT_PUBLIC_SENTRY_DSN=https://...                     # Client-side (browser)
SENTRY_AUTH_TOKEN=sntrys_...                           # Para subir source maps en CI
SENTRY_ORG=tu-org
SENTRY_PROJECT=virus

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Agregarlos en **Vercel → Project → Settings → Environment Variables**.

---

## Investigar un error en Sentry

1. Abrir [sentry.io](https://sentry.io) → proyecto **virus**
2. En **Issues** filtrar por:
   - `environment:production`
   - Rango de tiempo del incidente
3. Clic en el issue → ver **Stack Trace** con source maps ya aplicados
4. En el panel derecho: **Breadcrumbs** muestran las acciones del usuario previas al error
5. **Tags útiles**: `transaction` (ruta que falló), `runtime` (nodejs/edge/browser)

### Correlacionar con Inngest

1. En el stack trace buscar el `inngest_run_id` si está presente en el contexto
2. Ir a [app.inngest.com](https://app.inngest.com) → **Runs** → pegar el run ID
3. Ver cada `step.run()` con su input/output y tiempos
4. Los `job_events` de la tabla Supabase también tienen el historial con timestamps

### Ver logs del Worker en producción

El worker corre como parte del proceso de Next.js (mismo proceso, mismo Vercel).
Logs disponibles en:
- **Vercel Dashboard → Deployments → Functions logs** (filtrar por `/api/inngest`)
- **Inngest Dashboard → Runs** → cada step tiene su output

---

## Ver logs de Lambda (render de video)

1. Abrir **AWS Console → CloudWatch → Log Groups**
2. Buscar el grupo: `/aws/lambda/remotion-render` (o el nombre configurado en `AWS_LAMBDA_FUNCTION_NAME`)
3. Filtrar por el `video_id` que aparece en el error de Sentry
4. Los logs estructurados (`console.log({ fn, step, videoId })`) facilitan el filtrado

Alternativa rápida con CLI:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/remotion-render \
  --filter-pattern '"<video_id>"'
```

---

## Dashboards a bookmarkear

| Dashboard | URL | Para qué |
|-----------|-----|----------|
| Sentry Issues | sentry.io → Issues | Errores nuevos en producción |
| Sentry Performance | sentry.io → Performance | Latencia de API routes y DB |
| PostHog → Insights | posthog.com → Insights | Funnel idea → video → publish |
| PostHog → Session Replay | posthog.com → Recordings | Ver exactamente qué hizo el usuario antes de un error |
| Inngest Runs | app.inngest.com → Runs | Estado de jobs de generación de video |
| Vercel Functions | vercel.com → Deployments | Logs en tiempo real |

---

## Health check

`GET /api/health` — responde 200 si todo está OK, 503 si algún servicio falla.

```json
{
  "ok": true,
  "checks": {
    "db": { "ok": true, "latency_ms": 45 },
    "anthropic": { "ok": true },
    "elevenlabs": { "ok": true },
    "lambda": { "ok": true }
  }
}
```

**UptimeRobot**: configurar monitor HTTP → `https://virus.vercel.app/api/health`, intervalo 5 min, alerta a manunv97@gmail.com.

---

## Trackear eventos PostHog desde el frontend

Usar la función tipada en `src/lib/analytics.ts`:

```typescript
import { track } from "@/lib/analytics";

// Cuando se aprueba una idea
track({ name: "idea_approved", properties: { project_id, idea_id } });

// Cuando se copia un caption
track({ name: "caption_copied", properties: { video_id, platform: "instagram" } });
```

Los eventos disponibles están definidos como union type en `analytics.ts` — TypeScript avisa si mandás propiedades incorrectas.

---

## Filtrado de PII

Sentry está configurado para **no enviar**:
- `user.email` ni `user.username` en ningún evento
- Contenido de `voiceover_text` en breadcrumbs (reemplazado por `[REDACTED]`)

PostHog Session Replay tiene `maskAllInputs: true` — nunca graba contraseñas ni datos de formularios.
