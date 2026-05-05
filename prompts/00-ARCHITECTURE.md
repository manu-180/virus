# ARQUITECTURA — Proyecto Virus

## Estructura del repositorio (monorepo con pnpm workspaces)

```
virus/
├── apps/
│   ├── web/                    # Next.js 16 — dashboard, auth, UI
│   │   ├── src/app/            # App Router (rutas)
│   │   │   ├── (auth)/
│   │   │   └── (dashboard)/
│   │   │       ├── dashboard/  # Home overview (multi-project)
│   │   │       └── projects/   # CRUD + detail por proyecto
│   │   ├── src/components/     # UI components (shadcn + propios)
│   │   ├── src/lib/            # supabase, claude, elevenlabs clients
│   │   ├── src/hooks/          # custom React hooks
│   │   ├── src/server/         # server actions, route handlers
│   │   │   ├── projects/       # project CRUD server actions
│   │   │   └── generate/       # one-click generate endpoint
│   │   └── package.json
│   │
│   └── worker/                 # Inngest functions (background jobs)
│       ├── src/functions/      # render-video, parse-patterns, generate-script, etc.
│       └── package.json
│
├── packages/
│   ├── remotion/               # Templates de video como código (project-agnostic)
│   │   ├── src/templates/      # 6 templates (tip, hot-take, speed-build, listicle, story, comparison)
│   │   ├── src/components/     # captions, code-block, counter, etc.
│   │   ├── src/tokens/         # design tokens compartidos con web
│   │   └── remotion.config.ts
│   │
│   ├── db/                     # Supabase schema, migrations, types
│   │   ├── migrations/         # SQL files
│   │   ├── seed.sql
│   │   └── types.gen.ts
│   │
│   └── shared/                 # tipos compartidos, utilidades, prompts de Claude
│       ├── src/prompts/        # prompts versionados (Claude)
│       ├── src/types/
│       ├── src/viral/          # MOTOR GENÉRICO de patrones virales (data-driven)
│       │   ├── engine/         # genérico — opera sobre data del proyecto
│       │   ├── parser/         # parsers de archivos subidos (md/json/pdf/img)
│       │   └── seeds/          # data seed del proyecto default APEX-dev
│       └── src/project/        # tipos + helpers del concepto Proyecto
│
├── prompts/                    # ESTE directorio (instrucciones para los agentes)
│
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Concepto: Proyecto (Project) — el contenedor multi-tenant interno

> Un **Proyecto** es la unidad reutilizable: un nicho/producto con sus propios patrones virales, su info de marca, su voz y su historial.

Tipos clave (ver `packages/shared/src/project/types.ts`):

```ts
export interface Project {
  id: string;                       // uuid
  user_id: string;                  // dueño (Manuel)
  slug: string;                     // 'apex-dev', 'assistify', 'chatbot-pro'
  name: string;                     // "APEX — Servicios de software"
  description?: string;
  niche: string;                    // "dev/software" | "education" | "chatbot" — libre
  language: 'es-AR' | 'es-ES' | 'en-US' | string;
  voice_clone_id?: string;          // ElevenLabs voice ID (puede compartirse o por proyecto)
  theme_color: string;              // HEX accent
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  kind: 'viral_patterns' | 'project_info';
  version: number;                  // 1, 2, 3... (incrementa con cada re-upload)
  storage_path: string;             // 'projects/{id}/patterns/v3.md'
  mime_type: string;                // text/markdown | application/json | application/pdf | image/*
  parsed_at?: string;
  parse_status: 'pending' | 'ok' | 'failed';
  parse_error?: string;
  created_at: string;
}

// Estructura derivada de viral-patterns (parseada a estructura tipada)
export interface ProjectPatterns {
  project_id: string;
  source_file_id: string;
  hooks: ParsedHook[];
  formats: ParsedFormat[];
  pacing: PacingRules;
  visual_elements: VisualElement[];
  cta_templates: string[];
  hashtags: { reels: string[]; tiktok: string[]; shorts: string[] };
  raw: unknown;                     // backup del parseo crudo
  parsed_at: string;
}

// Estructura derivada de project-info (parseada a estructura tipada)
export interface ProjectBrand {
  project_id: string;
  source_file_id: string;
  brand_name: string;
  one_liner: string;
  audience: { who: string; where: string; pains: string[] };
  value_props: string[];
  features: string[];
  case_studies: { title: string; metric: string }[];
  voice_tone: string;
  ctas: { kind: string; value: string }[];
  do_not_say: string[];             // anti-patrones (cosas que NO debe decir)
  raw: unknown;
  parsed_at: string;
}
```

---

## Pipeline de generación de video (end-to-end, project-aware)

```
[USUARIO clickea "Generar" en /projects/[slug]]
       │  payload: { project_id }
       ▼
[0] LOAD PROJECT CONTEXT
    - project (row)
    - latest project_patterns (parseado)
    - latest project_brand (parseado)
    - últimos N hooks/topics/ángulos usados (anti-repetición)
       │
       ▼
[1] IDEA GENERATOR (Claude Sonnet 4.6)
    Input: project context + recent_used_signatures
    Output: { hook, angulo, formato, duracion_estimada, signature_hash }
       │
       ▼
[2] SCRIPT WRITER (Claude Sonnet 4.6)
    Input: idea + project_patterns + project_brand
    Output: script JSON con segments tipados
       │
       ▼
[3] AUDIO SYNTHESIS (ElevenLabs)
    Input: script + project.voice_clone_id (o default user clone)
    Output: MP3
       │
       ▼
[4] AUDIO POST (ffmpeg)
    Speed-up dinámico según patterns.pacing.audioSpeedMultiplier
       │
       ▼
[5] CAPTIONS (AssemblyAI o Whisper)
    Output: word-level timestamps
       │
       ▼
[6] REMOTION RENDER (Lambda)
    Input: { template, script, audio_url, captions, theme_color, brand_assets }
    Output: video MP4 1080×1920 H.264 30fps
       │
       ▼
[7] STORAGE (Supabase Storage)
    Path: projects/{id}/videos/{video_id}.mp4
       │
       ▼
[8] CAPTION GENERATOR (Claude Sonnet 4.6)
    Input: idea + script + project_patterns.cta_templates + project_brand.ctas
    Output: caption Instagram + hashtags + caption TikTok + caption Shorts
       │
       ▼
[9] PERSIST USED SIGNATURE
    INSERT INTO project_used_signatures (project_id, hook_hash, topic_hash, angle_hash, used_at)
       │
       ▼
[10] DASHBOARD UPDATE (Supabase Realtime)
    Channel: project:{slug}
    Estado: ready_to_publish
    Notificación al usuario
```

Cada paso es un step de **Inngest** (durable, retryable, observable).

---

## Modelo de datos (Supabase / Postgres)

### Tablas principales

```sql
-- Usuarios
profiles (
  id uuid PK refs auth.users,
  handle text,
  default_voice_clone_id text,        -- voice clone del usuario (puede heredarse a proyectos)
  default_language text,
  created_at timestamptz
)

-- PROYECTOS (multi-tenant interno por user)
projects (
  id uuid PK,
  user_id uuid FK profiles,
  slug text UNIQUE,                   -- url-friendly por user
  name text,
  description text,
  niche text,                         -- libre: 'dev', 'chatbot', 'education', etc.
  language text DEFAULT 'es-AR',
  voice_clone_id text,                -- override del default del user
  theme_color text DEFAULT '#0175C2',
  status text DEFAULT 'active',       -- 'active' | 'archived'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(user_id, slug)
)

-- Archivos subidos por proyecto (con versiones)
project_files (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  kind text CHECK (kind IN ('viral_patterns', 'project_info')),
  version int,                        -- incremental por kind
  storage_path text,                  -- 'projects/{id}/patterns/v3.md'
  mime_type text,
  size_bytes int,
  parse_status text DEFAULT 'pending',-- 'pending' | 'ok' | 'failed'
  parse_error text,
  parsed_at timestamptz,
  created_at timestamptz,
  UNIQUE(project_id, kind, version)
)

-- Patrones virales parseados (estructura derivada)
project_patterns (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  source_file_id uuid FK project_files,
  hooks jsonb,                        -- ParsedHook[]
  formats jsonb,                      -- ParsedFormat[]
  pacing jsonb,                       -- PacingRules
  visual_elements jsonb,
  cta_templates jsonb,
  hashtags jsonb,                     -- { reels, tiktok, shorts }
  raw jsonb,                          -- backup
  is_current boolean DEFAULT true,
  parsed_at timestamptz
)

-- Info de marca/producto parseada
project_brand (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  source_file_id uuid FK project_files,
  brand_name text,
  one_liner text,
  audience jsonb,
  value_props jsonb,
  features jsonb,
  case_studies jsonb,
  voice_tone text,
  ctas jsonb,
  do_not_say jsonb,
  raw jsonb,
  is_current boolean DEFAULT true,
  parsed_at timestamptz
)

-- Pilares (opcional por proyecto, default 60/30/10 si vacío)
content_pillars (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  name text,
  weight numeric,
  description text,
  example_themes text[]
)

-- Catálogo público de hooks (seed APEX-dev). NO project-scoped.
viral_hooks_seed (
  id uuid PK,
  niche text,                         -- 'dev', 'chatbot', 'general'
  hook text,
  hook_type text,
  estimated_engagement text,
  best_platforms text[],
  example_topics text[],
  language text DEFAULT 'es-AR'
)

-- Ideas generadas (project-scoped)
video_ideas (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  pillar_id uuid FK content_pillars,
  hook text,
  angle text,
  format text,
  estimated_duration int,
  signature_hash text,                -- hash(hook+angle+format) — para anti-repetición
  status text,                        -- 'draft' | 'approved' | 'rejected' | 'scripted'
  metadata jsonb,
  created_at timestamptz
)

-- Videos en pipeline (project-scoped)
videos (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  idea_id uuid FK video_ideas,
  template text,
  status text,
  theme_color text,
  language text,
  script jsonb,
  audio_url text,
  captions jsonb,
  video_url text,
  duration_seconds numeric,
  caption_instagram text,
  caption_tiktok text,
  caption_shorts text,
  hashtags text[],
  scheduled_for timestamptz,
  published_at timestamptz,
  inngest_run_id text,
  error text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Anti-repetición (project-scoped)
project_used_signatures (
  id uuid PK,
  project_id uuid FK projects ON DELETE CASCADE,
  hook_hash text,
  topic_hash text,
  angle_hash text,
  format text,
  used_at timestamptz,
  similarity_window_days int DEFAULT 14
)

-- Performance (project-scoped vía videos)
video_performance (
  id uuid PK,
  video_id uuid FK videos ON DELETE CASCADE,
  platform text,
  views int,
  likes int,
  comments int,
  saves int,
  shares int,
  avg_watch_time numeric,
  hook_retention numeric,
  measured_at timestamptz
)

-- Auditoría de jobs
job_events (
  id bigserial PK,
  video_id uuid FK videos ON DELETE CASCADE,
  step text,
  status text,
  duration_ms int,
  payload jsonb,
  created_at timestamptz
)
```

### RLS

- Todas las tablas con `user_id` (vía `projects.user_id`) → policy `auth.uid() = projects.user_id`.
- `viral_hooks_seed`: SELECT público para users autenticados; INSERT/UPDATE/DELETE solo service_role.
- Service role bypass en todas (Inngest worker corre con service role).

---

## Storage (Supabase Storage)

### Buckets

| Bucket | Path layout | Visibility |
|--------|-------------|------------|
| `project-files` | `{project_id}/patterns/v{n}.{ext}` y `{project_id}/info/v{n}.{ext}` | private — signed URL on read |
| `videos` | `{project_id}/{video_id}.mp4` | private — signed URL on read |
| `audio` | `{project_id}/{video_id}.mp3` | private — signed URL on read |
| `thumbnails` | `{project_id}/{video_id}.jpg` | private — signed URL on read |

Política: signed URLs con expiración 24h. Solo el dueño del proyecto puede leer.

---

## Parser de archivos del proyecto (T2-P09)

Los archivos `viral-patterns` y `project-info` pueden venir en distintos formatos. El parser:

1. Detecta MIME type.
2. Si es **markdown/JSON/text** → parser determinístico + Claude Sonnet 4.6 para normalizar a `ProjectPatterns` / `ProjectBrand`.
3. Si es **PDF** → extrae texto con pdf-parse + pasada por Claude.
4. Si es **imagen** (PNG/JPG/WebP) → Claude Vision describe + extrae estructura.
5. Falla suave: deja `parse_status = 'failed'` con `parse_error` legible y permite re-intentar.

El parser corre como **Inngest function** disparada por upload exitoso a Storage.

---

## APIs y servicios externos

| Servicio | Uso | Costo aproximado | Account |
|----------|-----|------------------|---------|
| Supabase | DB + Auth + Storage + Realtime | Free tier hasta 500MB DB, 1GB storage. Pro $25/mes si excede. | Manuel |
| Vercel | Host de Next.js | Hobby gratis, Pro $20/mes si pasás 100GB bandwidth | Manuel |
| AWS Lambda + S3 | Remotion Lambda renders | ~$0.0001/segundo de video. 30 videos/mes ≈ $5-10/mes | Manuel |
| ElevenLabs | TTS + Voice Clone | Plan Creator $22/mes (100K chars) o Pro $99/mes (500K chars) | Manuel |
| Anthropic API | Claude Sonnet/Opus | Sonnet $3/MTok input, Opus $15/MTok input. ~$5-15/mes | Manuel |
| AssemblyAI | Captions con timestamps | $0.37/hora de audio. ~$2/mes | Opcional |
| Inngest | Job queue | Free tier 25K runs/mes | Manuel |

**Costo total mensual estimado en producción: $50-80 USD** (dependiendo de volumen).

---

## Decisiones rechazadas y por qué

- **Hardcodear hooks/formatos en código (plan v1):** rechazado a favor de motor genérico data-driven. Razón: querés N proyectos con N nichos distintos. Hardcodear obliga a recompilar para cada nicho.
- **Schema separado por proyecto (Postgres schemas):** demasiada infra. RLS + project_id resuelve aislamiento sin sacrificar simplicidad.
- **Embeddings/vector store para anti-repetición:** overkill al inicio. Hash-based + similarity con Claude alcanza para 30-50 videos/mes/proyecto. Migrar a pgvector cuando haya >500 videos por proyecto.
- **Separar app por proyecto:** un solo dashboard con switcher es 10× mejor DX.
- **OpenAI/GPT en vez de Claude:** Manuel tiene preferencia por Claude (instrucciones globales) y la calidad para scripts en español es mejor con Claude.
- **Pictory / Heygen / Synthesia:** no-code limita templates Fireship-style; precio escala feo; no permite código animado real.
- **After Effects con scripting:** require licencia Adobe + render en máquina propia; no escalable serverless.
- **BullMQ + Redis self-hosted:** más infra; Inngest es DX 10× mejor.
- **Drizzle ORM:** Supabase JS client es suficiente.
- **NextAuth:** Supabase Auth es el stack del usuario.

---

## Estética de la app (UI premium con login + project switcher)

Hereda de APEX (`ANALISIS.md`):

- **Fuente:** Oxanium (variable, vía next/font o Google Fonts)
- **Paleta default (oscuro):** `#111318` background. Accent **dinámico por proyecto** (`projects.theme_color`).
- **Glassmorphism:** sutil en cards de pipeline.
- **Animaciones:** Framer Motion. CursorGlowFrame en cards principales.
- **Modo oscuro default**, toggle a claro.
- **Project switcher:** combobox en topbar que cambia el contexto activo. Persistir en `localStorage` + cookie para SSR.

---

## Seguridad

- Todos los secrets en `.env.local` y `Vercel Env Vars`.
- API routes validan auth con Supabase server client + verifican que `project_id` pertenece a `auth.uid()`.
- Rate limiting en `/api/generate` (Upstash Redis o Inngest concurrency) — máx 5 generaciones simultáneas por user.
- RLS en todas las tablas vía join con `projects`.
- Signed URLs de Supabase Storage con expiración 24h.
- Voice clone IDs encriptados con pgsodium.
- Archivos subidos: límite 10MB por archivo. MIME type whitelist. Scan de tamaño y tipo antes de Storage.

---

## Testing

- **E2E:** Playwright contra `localhost:3000`. Cubre: login, crear proyecto, subir 2 archivos, esperar parse_status=ok, click "Generar", verificar video en estado `ready_to_publish` (con stubs en Lambda/ElevenLabs).
- **Unit:** Vitest en `packages/shared/viral` (engine genérico + parsers).
- **Integración Inngest:** los handlers se prueban con `inngest test`.
- **Visual regression:** Chromatic para componentes Remotion (opcional, en T7).

---

## Observabilidad

- **Sentry** en Next.js + worker (errores). Tag por `project_id`.
- **PostHog** para analytics de uso del dashboard. Eventos por `project_id`.
- **Inngest Dashboard** para estado del pipeline.
- **Supabase Logs** para queries SQL.

(Estos están en T7-P02; al inicio se vive sin ellos.)
