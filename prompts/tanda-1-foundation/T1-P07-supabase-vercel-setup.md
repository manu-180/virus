---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: general-purpose
tanda: 1
depende-de: []
file-ownership:
  - docs/setup/supabase.md
  - docs/setup/vercel.md
  - docs/setup/anthropic.md
  - docs/setup/inngest.md
  - docs/setup/assemblyai.md
  - docs/setup/00-checklist.md
duracion-estimada: 30 min (15 min agente + 15 min Manuel)
---

# T1-P07 — Setup Supabase + Vercel + Anthropic + Inngest + AssemblyAI

## Contexto

Antes de arrancar a codear, Manuel necesita tener todas las credenciales de los servicios externos en `.env.local`. Tu tarea es **producir las guías paso a paso** para los 5 servicios restantes (ElevenLabs y AWS son T1-P05 y T1-P06).

Cada guía debe ser corta, accionable, sin teoría. Tipo "5 pasos y listo".

## Guías a producir

### 1. `docs/setup/supabase.md`

Pasos:

1. https://supabase.com/dashboard → "New project".
2. Org: personal o crear nueva. Nombre proyecto: `virus`. Region: `South America (São Paulo) sa-east-1` (más cercano a Argentina). Password DB: generar uno fuerte y guardarlo en password manager.
3. Esperar ~2 min a que provisione.
4. Settings → API → copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (NO se expone al cliente)
5. Settings → General → copiar `Reference ID` → `SUPABASE_PROJECT_REF`.
6. Authentication → Providers → habilitar **Google** (OAuth):
   - Ir a Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID.
   - Application type: Web application. Authorized redirect URI: copiarlo de la UI de Supabase (ej. `https://<ref>.supabase.co/auth/v1/callback`).
   - Pegar Client ID + Client Secret en Supabase.
7. Authentication → URL Configuration → agregar:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://virus.vercel.app/auth/callback` (placeholder hasta que esté en Vercel).

#### Local CLI

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref $SUPABASE_PROJECT_REF
```

Esto vincula el repo con el proyecto cloud para hacer push de migraciones después.

### 2. `docs/setup/vercel.md`

Pasos:

1. https://vercel.com/signup → login con GitHub.
2. (Skip) No deployar todavía — eso lo hace T7-P02 cuando todo esté listo.
3. Si Manuel quiere deploy preview ahora: "Add New Project" → Import git repo → root path `apps/web` → Framework: Next.js (autodetecta).
4. Environment variables: pegar todas las de `.env.local`.

(Esta guía es corta porque el deploy real es de T7. Acá es solo: cuenta creada, listo para deploy futuro.)

### 3. `docs/setup/anthropic.md`

Pasos:

1. https://console.anthropic.com → sign in.
2. Settings → API Keys → Create Key → nombre `virus-prod`.
3. Copiar key → `.env.local` como `ANTHROPIC_API_KEY=sk-ant-...`.
4. Settings → Plans & billing → cargar tarjeta + setear soft limit a $50/mes (alerta) y hard limit a $100/mes.
5. (Opcional) Habilitar **Prompt Caching** y **Batch API** si Manuel los va a usar (T2-P03/04 los aprovecha).

#### Modelos disponibles a usar

```
claude-opus-4-7              # Opus 4.7 estándar (200K context)
claude-opus-4-7[1m]          # Opus 4.7 con 1M de contexto (más caro, solo cuando hace falta)
claude-sonnet-4-6            # Sonnet 4.6 default
claude-haiku-4-5-20251001    # Haiku 4.5 (no lo usamos en este proyecto)
```

Los IDs ya están en código en `packages/shared/src/ai/models.ts` (lo crea T2-P03).

### 4. `docs/setup/inngest.md`

Pasos:

1. https://app.inngest.com → sign up.
2. Crear app: nombre `virus`. Environment: production.
3. Settings → Event Keys → copiar → `INNGEST_EVENT_KEY`.
4. Settings → Signing Key → copiar → `INNGEST_SIGNING_KEY`.
5. Para development local:
   ```bash
   pnpm dlx inngest-cli@latest dev
   ```
   Esto levanta Inngest dev server en `localhost:8288`. No requiere credenciales en dev.

### 5. `docs/setup/assemblyai.md`

(Captions opcional pero recomendado.)

Pasos:

1. https://www.assemblyai.com/dashboard/signup
2. Free tier: $50 de créditos. A $0.37/hora de audio, alcanza para >100 horas (más que suficiente para arrancar).
3. Dashboard → API Keys → copiar → `ASSEMBLYAI_API_KEY`.

### 6. `docs/setup/00-checklist.md` (índice + checklist final)

```markdown
# Setup Checklist — Proyecto Virus

Tildá cada uno antes de empezar a codear:

- [ ] **Node 22 LTS** instalado (`node -v` → v22.x)
- [ ] **pnpm 9+** instalado (`pnpm -v` → 9.x)
- [ ] **AWS CLI** instalado y configurado (`aws --version`, opcional pero útil)
- [ ] **Supabase CLI** instalado (`pnpm dlx supabase --version`)
- [ ] **ffmpeg** instalado (`ffmpeg -version`) — necesario para post-process de audio

Servicios:

- [ ] **Supabase** — proyecto creado, env vars en `.env.local`, Google OAuth configurado → ver `supabase.md`
- [ ] **Vercel** — cuenta creada → ver `vercel.md`
- [ ] **Anthropic** — API key + tarjeta + límites → ver `anthropic.md`
- [ ] **Inngest** — app creada, event/signing keys → ver `inngest.md`
- [ ] **AssemblyAI** — API key → ver `assemblyai.md`
- [ ] **ElevenLabs** — voice clone + API key → ver `elevenlabs.md`
- [ ] **AWS** — IAM user + Remotion Lambda deployed → ver `aws-remotion-lambda.md`

`.env.local` debe tener TODAS estas variables completas:

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ANTHROPIC_API_KEY=
ASSEMBLYAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=
REMOTION_S3_BUCKET=
REMOTION_SERVE_URL=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000

Cuando estén todas, ejecutá:
```

```bash
pnpm install
pnpm typecheck
pnpm dev
```

```markdown
Si algo falla → buscar la guía específica del servicio.
```

## Output esperado

5 archivos `.md` cortos y accionables + el checklist maestro.

## Notas

- Cada guía es para Manuel, NO para otro agente. Lenguaje claro, sin tecnicismos innecesarios.
- Si un servicio puede tener un free tier suficiente, decilo (ahorra dinero).
- NO toques `.env.local` ni código.
