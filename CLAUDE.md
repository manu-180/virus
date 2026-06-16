# vhirus — instrucciones para Claude

Monorepo (pnpm + turbo) del sistema de contenido/IG: generación de carruseles,
auto-publish a Instagram y el orquestador de la Vidriera.

## ⚠️ Hechos operativos que NO hay que romper

### El dashboard web (`apps/web` → Vercel `virus-web`) tiene el auto-deploy DESHABILITADO a propósito
- **Decisión 2026-06-15 (Manuel + Hornero). NO reactivar sin confirmar con Manuel.**
- Manuel **no usa** el dashboard: todo está automatizado. La automatización corre **100% en el
  worker de Railway**, no en la web. `virus-web` venía fallando el build hace semanas sin impacto.
- El apagado está en `vercel.json` (`git.deploymentEnabled: false`). Es **reversible** (`true` para
  reactivar) y **ahorra recursos** (deja de quemar builds que fallan).
- **No es un bug.** Antes de "arreglar" el build de `virus-web` o reactivar su deploy: **pará y
  confirmá con Manuel.** Detalle completo en [docs/deployment.md](docs/deployment.md).
- Salvedad: el callback de OAuth de Instagram (`apps/web/.../ig-accounts/connect/callback`) vive en la
  web; solo se usa al conectar una cuenta de IG nueva (manual, raro).

### La automatización vive en el worker (Railway), no en la web
- Inngest se sirve **solo** desde `apps/worker/src/server.ts` (`/api/inngest`). La web NO tiene ese endpoint.
- El worker deploya a **Railway** (`apps/worker/Dockerfile` + `apps/worker/railway.toml`) en push a `main`.
- Las rutas `/scheduler/batch` y `/cron/sweep-stuck-carousels` en `apps/web` son **duplicados legacy**;
  las que corren de verdad son las funciones Inngest del worker.

## Stack y deploy
- Web (apps/web) → Vercel **(auto-deploy OFF, ver arriba)**. Worker (apps/worker) → Railway.
- DB → Supabase (MCP `supabase-virus`). Renders de video → AWS Lambda (Remotion).
- Detalle de deploy/rollback/runbook: [docs/deployment.md](docs/deployment.md).

## Verificación antes de pushear a `main` (dispara Railway)
- `pnpm --filter @virus/shared typecheck` + `test` (carrusel).
- `pnpm --filter web typecheck` tiene errores **pre-existentes** tolerados a propósito
  (`next.config` con `typescript.ignoreBuildErrors: true`): RPC sin tipar, `asChild` en Button/Popover,
  módulos `inngest`/`nodejs-whisper` no instalados local. No son bloqueantes; no los confundas con nuevos.
