---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: deployment-engineer
tanda: 7
depende-de: [T4-P07, T5-P02]
file-ownership:
  - .github/workflows/
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
  - .github/workflows/preview.yml
  - vercel.json
  - apps/web/next.config.mjs
  - docs/deployment.md
duracion-estimada: 45 min
---

# T7-P02 — CI/CD + deployment a producción

## Contexto

Deploy a Vercel (Next.js), Supabase Cloud (DB), AWS Lambda (Remotion ya deployed en T1-P06), Inngest Cloud (worker).

## Tarea

### 1. GitHub Actions

#### `.github/workflows/ci.yml`
- Trigger: PR a main.
- Jobs:
  - typecheck: `pnpm typecheck`.
  - lint: `pnpm lint`.
  - test unit: `pnpm test`.
  - test e2e (chromium): start Next.js + Inngest dev → `pnpm playwright test`.
- Cache: pnpm store + .next + .turbo.

#### `.github/workflows/deploy.yml`
- Trigger: push a main.
- Jobs:
  - migrate-db: `supabase db push --linked` (con secret `SUPABASE_DB_PASSWORD`).
  - deploy-web: `vercel deploy --prod` con `VERCEL_TOKEN`.
  - deploy-lambda: re-deploy Remotion site (`pnpm --filter @virus/remotion deploy:site`).
  - notify: Slack/Discord webhook con resultado.

#### `.github/workflows/preview.yml`
- Trigger: PR.
- Vercel preview + Supabase branch para cada PR.

### 2. Vercel config

`vercel.json`:
```json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "nextjs",
  "regions": ["gru1"],
  "ignoreCommand": "git diff --quiet HEAD^ HEAD ./apps/web ./packages"
}
```

### 3. Next.js config (`next.config.mjs`)

- `output: 'standalone'` opcional para Docker.
- `images.remotePatterns`: dominios permitidos (Supabase storage, AssemblyAI, S3).
- `transpilePackages: ['@virus/shared', '@virus/db']`.
- React strict mode on.
- Experimental: `serverActions: { bodySizeLimit: '50mb' }` (subida de voice samples).

### 4. Inngest deployment

- Production endpoint: `https://virus.vercel.app/api/inngest`.
- Configurar en Inngest dashboard "Sync".
- Verificar functions visible.

### 5. Documentación de deploy

`docs/deployment.md`:
- Cómo deployar manualmente.
- Cómo hacer rollback.
- Cómo correr migrations.
- Cómo redeployar Remotion Lambda cuando se modifican templates.
- Runbook de incidentes (qué hacer si renders fallan, si rate limits explotan, etc.).

## Output esperado

Pipeline CI/CD completo. Push a main → site live + DB migrated en <5 min.
