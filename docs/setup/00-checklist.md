# Setup Checklist — Proyecto Virus

Tildá cada uno antes de empezar a codear.

---

## Herramientas locales

- [ ] **Node 22 LTS** instalado → `node -v` debe mostrar `v22.x`
- [ ] **pnpm 9+** instalado → `pnpm -v` debe mostrar `9.x`
- [ ] **Supabase CLI** → `pnpm dlx supabase --version`
- [ ] **ffmpeg** instalado → `ffmpeg -version` (necesario para post-process de audio)
- [ ] **AWS CLI** instalado → `aws --version` (opcional pero útil para Remotion Lambda)

---

## Servicios externos

| Servicio | Estado | Guía |
|----------|--------|------|
| **Supabase** | Proyecto activo (`jdkjnaivkucnpvmwuraz`), keys en `.env.local`, Google OAuth configurado | [supabase.md](supabase.md) |
| **Vercel** | Cuenta creada | [vercel.md](vercel.md) |
| **Anthropic** | API key + tarjeta + límites ($50 soft / $100 hard) | [anthropic.md](anthropic.md) |
| **Inngest** | App creada, event/signing keys en `.env.local` | [inngest.md](inngest.md) |
| **AssemblyAI** | API key en `.env.local` | [assemblyai.md](assemblyai.md) |
| **ElevenLabs** | Voice clone creado, API key en `.env.local` | [elevenlabs.md](elevenlabs.md) |
| **AWS** | IAM user + Remotion Lambda deployed | [aws-remotion-lambda.md](aws-remotion-lambda.md) |

---

## `.env.local` completo

El archivo debe tener **todas** estas variables antes de correr el proyecto:

```env
# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Anthropic
ANTHROPIC_API_KEY=

# AssemblyAI
ASSEMBLYAI_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://jdkjnaivkucnpvmwuraz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impka2puYWl2a3VjbnB2bXd1cmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODEzMDQsImV4cCI6MjA5MzI1NzMwNH0.1HxWaPuVta8eefvLvn_wFf-I_ek0I5-Hz6ApZXXggRM
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=jdkjnaivkucnpvmwuraz

# AWS + Remotion
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=
REMOTION_S3_BUCKET=
REMOTION_SERVE_URL=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Las vars de Supabase URL y ANON_KEY ya están completas — son del proyecto activo. Solo falta la `SUPABASE_SERVICE_ROLE_KEY` (obtenerla del dashboard, ver `supabase.md`).

---

## Arrancar el proyecto

Una vez completas todas las vars:

```bash
pnpm install
pnpm typecheck
pnpm dev
```

Si algo falla → buscar la guía específica del servicio en esta carpeta.
