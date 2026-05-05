# Deployment Guide

## Arquitectura de deploy

| Servicio | Plataforma | Trigger |
|---|---|---|
| Web (`apps/web`) | Vercel | Push a `main` |
| Base de datos | Supabase Cloud | Push a `main` (CI/CD) |
| Worker (`apps/worker`) | Inngest Cloud | Sync manual post-deploy |
| Renders de video | AWS Lambda (Remotion) | Push a `main` (CI/CD) |

---

## Deploy manual (sin CI/CD)

### Web — Vercel

```bash
# Instalar Vercel CLI si no está instalado
pnpm add -g vercel

# Linkear proyecto (primera vez)
vercel link

# Deploy a producción
vercel deploy --prod
```

### DB — Supabase migrations

```bash
# Instalar Supabase CLI si no está instalado
pnpm add -g supabase

# Autenticar
supabase login

# Linkear al proyecto de producción
supabase link --project-ref <PROJECT_REF>

# Ver estado de migraciones
supabase migration list

# Aplicar migraciones pendientes
supabase db push
```

### Remotion Lambda — re-deploy de site

```bash
# Re-deployar el site de Remotion (necesario cuando se modifican templates)
pnpm --filter @virus/remotion deploy:site
```

Esto sube los bundles de video a S3 y actualiza la URL del site en Lambda.

---

## Rollback

### Web (Vercel)

1. Ir a **Vercel Dashboard → Deployments**
2. Encontrar el último deploy estable
3. Click en **"..."** → **"Promote to Production"**

O via CLI:

```bash
# Listar deployments recientes
vercel ls

# Promover un deployment anterior a producción
vercel promote <deployment-url>
```

### Base de datos

Supabase no tiene rollback automático de migraciones. Para revertir:

1. **Identificar la migración problemática** en `supabase/migrations/`
2. **Crear una nueva migración** que revierta los cambios (`ALTER TABLE`, `DROP COLUMN`, etc.)
3. Pushear la migración de rollback: `supabase db push`

> ⚠️ Nunca eliminar archivos de migración existentes. El historial debe ser append-only.

### Remotion Lambda

```bash
# Re-deployar el site anterior (usar el commit anterior)
git checkout <commit-anterior>
pnpm --filter @virus/remotion deploy:site
```

---

## Correr migraciones

### En desarrollo local

```bash
# Levantar Supabase local
supabase start

# Crear nueva migración
supabase migration new <nombre-descriptivo>
# Editar el archivo generado en supabase/migrations/

# Aplicar localmente
supabase db reset
```

### En producción (manual)

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

### En CI/CD

Las migraciones se corren automáticamente en el job `migrate-db` del workflow `deploy.yml` al hacer push a `main`.

---

## Re-deploy de Remotion Lambda

Necesario cuando se modifican templates de video en `packages/remotion/` o `packages/shared/`.

```bash
# Asegurarse de tener AWS credentials configuradas
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=...

# Re-deployar
pnpm --filter @virus/remotion deploy:site
```

El CI/CD lo hace automáticamente en cada push a `main` via el job `deploy-lambda`.

---

## Inngest — sincronización de funciones

Después de cada deploy de la web, sincronizar las funciones de Inngest:

1. Ir a **Inngest Dashboard → Functions**
2. Click en **"Sync"**
3. Endpoint de producción: `https://virus.vercel.app/api/inngest`
4. Verificar que todas las funciones aparecen como `ACTIVE`

> El endpoint de Inngest se configura en `apps/web/src/app/api/inngest/route.ts`

---

## Secrets requeridos (GitHub Actions)

| Secret | Descripción | Dónde obtenerlo |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personal de Supabase | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | ID del proyecto Supabase | URL del dashboard: `supabase.com/dashboard/project/[REF]` |
| `SUPABASE_DB_PASSWORD` | Password de la base de datos | Supabase Dashboard → Project Settings → Database |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública | Supabase Dashboard → Project Settings → API |
| `VERCEL_TOKEN` | Token de API de Vercel | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Org/Team ID de Vercel | `cat .vercel/project.json` \| campo `orgId` |
| `VERCEL_PROJECT_ID` | Project ID de Vercel | `cat .vercel/project.json` \| campo `projectId` |
| `AWS_ACCESS_KEY_ID` | AWS access key | IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | IAM → Users → Security credentials |
| `AWS_REGION` | Región de AWS Lambda | La región donde está deployado Remotion |
| `INNGEST_SIGNING_KEY` | Signing key de Inngest | Inngest Dashboard → Settings |
| `SLACK_WEBHOOK_URL` | Webhook para notificaciones | Slack → Apps → Incoming Webhooks |
| `TURBO_TOKEN` | Token de Turbo Remote Cache (opcional) | vercel.com/dashboard/remote-cache |
| `TURBO_TEAM` | Team ID para Turbo (opcional) | vercel.com/dashboard/remote-cache |

### Obtener IDs de Vercel

```bash
npx vercel link
cat .vercel/project.json
# { "orgId": "...", "projectId": "..." }
```

---

## Runbook de incidentes

### Renders fallan (Remotion Lambda)

**Síntomas:** Jobs de video en estado `ERROR`, usuarios no reciben su video.

**Checklist:**
1. Revisar logs en AWS CloudWatch → Log group `/aws/lambda/remotion-render-*`
2. Verificar que el site de Remotion está actualizado: re-correr `pnpm --filter @virus/remotion deploy:site`
3. Verificar AWS credentials y permisos del rol de Lambda
4. Verificar que el timeout de Lambda es suficiente (renders largos pueden exceder el límite)
5. Si el issue es de memoria, aumentar `memorySizeInMb` en la config de Remotion Lambda

**Recuperación:** Los jobs fallidos se pueden reintentar desde Inngest Dashboard → Functions → buscar el job fallido → "Retry".

---

### Rate limits explotan (AssemblyAI / Anthropic / AWS)

**Síntomas:** Errores 429, jobs en cola sin procesar, usuarios esperando demasiado.

**Checklist:**
1. Revisar Inngest Dashboard → Functions → ver jobs en estado `RATE_LIMITED` o `FAILED`
2. Identificar qué servicio está siendo limitado (logs de Inngest)
3. Reducir concurrencia en las funciones afectadas en `packages/inngest/`

**AssemblyAI específicamente:**
- Dashboard en assemblyai.com → Usage → ver requests por minuto
- Ajustar `concurrency` en la función de transcripción

**Anthropic:**
- Dashboard en console.anthropic.com → Usage
- Ajustar delays entre requests o implementar retry con backoff

**Recuperación:** Una vez que pase el rate limit, reintentar los jobs fallidos desde Inngest Dashboard.

---

### Web no carga (Vercel down)

1. Verificar estado en [vercel.com/status](https://vercel.com/status)
2. Revisar logs en Vercel Dashboard → Deployments → último deploy → Functions
3. Si el último deploy es el problema: hacer rollback (ver sección Rollback)
4. Si es un issue de Vercel: comunicar a usuarios que hay mantenimiento

---

### Base de datos no responde (Supabase)

1. Verificar estado en [status.supabase.com](https://status.supabase.com)
2. Revisar Supabase Dashboard → Project → Logs → Database
3. Verificar conexiones activas (posible connection pool exhausto)
4. Si hay demasiadas conexiones: revisar si hay queries lentas o conexiones zombie
5. Última opción: pausar y reanudar el proyecto desde Supabase Dashboard

---

## Notas de performance

- El `ignoreCommand` en `vercel.json` evita re-builds si no hay cambios en `apps/web` o `packages/`
- El caché de Turbo (`.turbo/`) acelera los jobs de CI significativamente
- Las migraciones solo corren si hay cambios — el workflow las ejecuta siempre en deploy, Supabase CLI es idempotente
