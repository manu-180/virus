# Getting Started

Guía para volver al proyecto después de tiempo sin tocarlo. Paso a paso desde cero hasta el primer video generado.

---

## Requisitos previos

Antes de empezar, asegurate de tener:

- **Node.js 22+** (`node --version`)
- **pnpm 9+** (`pnpm --version`) — si no: `npm install -g pnpm`
- **Git**
- Cuentas activas en: Supabase, Vercel, AWS, ElevenLabs, Anthropic, AssemblyAI, Inngest

Ver checklist completo en [docs/setup/00-checklist.md](setup/00-checklist.md).

---

## 1. Clonar e instalar

```bash
git clone <tu-repo> virus
cd virus
pnpm install
```

---

## 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completar `.env.local` con los valores reales. Necesitás:

| Variable | Dónde conseguirla |
|----------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `SUPABASE_PROJECT_REF` | Supabase → Settings → General |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile |
| `ELEVENLABS_VOICE_ID` | Ver paso 5 (voice clone) |
| `ASSEMBLYAI_API_KEY` | assemblyai.com → Account |
| `AWS_ACCESS_KEY_ID` | AWS IAM (ver [docs/setup/aws-remotion-lambda.md](setup/aws-remotion-lambda.md)) |
| `AWS_SECRET_ACCESS_KEY` | Mismo usuario IAM |
| `AWS_REGION` | `us-east-1` (recomendado) |
| `REMOTION_LAMBDA_FUNCTION_NAME` | Después del deploy de Lambda (paso 4) |
| `REMOTION_S3_BUCKET` | Después del deploy de Lambda (paso 4) |
| `INNGEST_EVENT_KEY` | app.inngest.com → Settings |
| `INNGEST_SIGNING_KEY` | app.inngest.com → Settings |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` en dev |

Guías detalladas por servicio en `docs/setup/`.

---

## 3. Migrar la base de datos

```bash
# Opción A: Supabase CLI (recomendado)
npx supabase db push --project-ref <TU_PROJECT_REF>

# Opción B: desde el Supabase Dashboard
# SQL Editor → ejecutar cada archivo en packages/db/supabase/migrations/ en orden
```

Verificar que las 13 migraciones estén aplicadas:
- Supabase Dashboard → Database → Migrations

Después, seedear los datos iniciales:

```bash
pnpm --filter @virus/db seed
```

Esto crea el proyecto "APEX-dev" con 30 viral hooks y 3 pillar templates listos para usar.

---

## 4. Deploy de AWS Lambda (Remotion)

Este paso habilita el renderizado real de videos MP4. Solo hay que hacerlo una vez.

```bash
cd infra/remotion-lambda
pnpm install
node deploy.mjs
```

Al terminar, el script imprime:
- `REMOTION_LAMBDA_FUNCTION_NAME` — copiar a `.env.local`
- `REMOTION_S3_BUCKET` — copiar a `.env.local`

Ver guía completa en [docs/setup/aws-remotion-lambda.md](setup/aws-remotion-lambda.md).

---

## 5. Voice clone (opcional pero recomendado)

Sin voice clone, los videos usan la voz por defecto de ElevenLabs. Con clone, usan tu voz.

1. Grabar 3–5 minutos de audio claro (sin ruido de fondo, voz natural)
2. Subir en `elevenlabs.io` → Voices → Add Voice → Instant Voice Clone
3. Copiar el **Voice ID** generado
4. Pegarlo en `.env.local` como `ELEVENLABS_VOICE_ID`
5. También se puede configurar por proyecto desde `/dashboard/settings/voice`

Ver guía completa en [docs/setup/elevenlabs.md](setup/elevenlabs.md).

---

## 6. Levantar el proyecto local

```bash
# Terminal 1: Next.js + API routes
pnpm dev

# Terminal 2: Inngest dev server (jobs en background)
pnpm --filter @virus/worker inngest
```

Abrir:
- `http://localhost:3000` → Dashboard de Virus
- `http://localhost:8288` → Inngest dashboard (monitoreo de jobs)

---

## 7. Primer video end-to-end

### Opción A: Desde el dashboard

1. Ir a `http://localhost:3000`
2. Login → se crea tu usuario automáticamente
3. En `/onboarding`, completar los 4 pasos (nombre, subir archivos de patrones, brand, voz)
4. Ir a `/dashboard/ideas` → clic en "Generar ideas"
5. Aprobar una idea → el pipeline arranca automáticamente
6. Monitorear en `/dashboard/pipeline` (o en Inngest dashboard)
7. Cuando el estado sea `ready`, bajar el video desde `/dashboard/pipeline`

### Opción B: Test rápido con evento manual (sin UI completa)

En el Inngest dashboard (`http://localhost:8288`):

```json
Event: virus/idea.approved
Payload:
{
  "videoId": "test-001",
  "userId": "tu-user-id-de-supabase"
}
```

Esto dispara el pipeline completo. El video de prueba usa el proyecto APEX-dev del seed.

---

## Estado esperado al terminar

- Dashboard cargando en `http://localhost:3000`
- Inngest mostrando la app "virus" con 6 funciones registradas
- Al menos un video en estado `ready` en `/dashboard/pipeline`
- Video descargable como MP4 (1080×1920)

---

## Problemas comunes

Ver [docs/troubleshooting.md](troubleshooting.md) para la lista completa.

Los más frecuentes al volver al proyecto después de tiempo:

- **Variables de entorno vencidas:** Los API keys de Anthropic y ElevenLabs expiran. Verificar en las consolas respectivas.
- **Lambda desactualizada:** Si el código de Remotion cambió, re-deploy: `node infra/remotion-lambda/deploy.mjs`
- **Migraciones faltantes:** Si hay errores de DB, correr `npx supabase db push` de nuevo.
- **pnpm install necesario:** Si hay errores de imports, `pnpm install` en la raíz.
