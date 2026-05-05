---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: typescript-pro
tanda: 1
depende-de: []
file-ownership:
  - package.json
  - pnpm-workspace.yaml
  - turbo.json
  - tsconfig.base.json
  - .gitignore
  - .editorconfig
  - .prettierrc
  - .nvmrc
  - apps/web/ (init solo, sin lógica)
  - apps/worker/ (init solo)
  - packages/shared/package.json
  - packages/db/package.json
  - packages/remotion/package.json
duracion-estimada: 30 min
---

# T1-P01 — Inicialización del monorepo

## Contexto

Sos parte de un equipo construyendo "Virus", una app Next.js que genera videos virales para Instagram Reels / TikTok / Shorts en el nicho dev. Tu tarea es **dejar el monorepo inicializado y funcional** para que las otras tandas puedan empezar a escribir código.

Lee primero estos archivos para tener contexto completo:
- `prompts/00-README.md`
- `prompts/00-ARCHITECTURE.md`

NO leas otros prompts — los demás agentes van a trabajar en paralelo y vas a contaminarte.

## Tarea

Crear la estructura monorepo descrita en `00-ARCHITECTURE.md`:

```
virus/
├── apps/web/              ← Next.js 16 (App Router, TS, Tailwind)
├── apps/worker/           ← Node + Inngest
├── packages/shared/       ← TS puro, types, utilidades
├── packages/db/           ← Supabase migrations + types
├── packages/remotion/     ← Remotion 4
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

### Requisitos específicos

1. **pnpm workspaces** (no npm, no yarn). Asumí pnpm 9+.
2. **Node 22 LTS**. Crear `.nvmrc` con `22`.
3. **TypeScript 5.6+** estricto. Un `tsconfig.base.json` que los demás extienden.
4. **Turborepo** para orquestar `dev`, `build`, `lint`, `typecheck`, `test` en paralelo.
5. **Prettier + ESLint flat config** mínimos.
6. **`.gitignore`** que cubra `node_modules`, `.next`, `out`, `dist`, `.env*`, `.turbo`, `*.log`, `coverage`, `.DS_Store`, `out/`, `.vercel/`.
7. **`.env.example`** con TODAS las variables que el proyecto va a necesitar (con comentarios). Ver lista completa en sección "Variables de entorno" abajo. Estos valores los completarán otros prompts; vos solo dejás los placeholders.

### Inicialización por package

- **`apps/web`**: `pnpm create next-app@latest` con flags `--ts --tailwind --app --src-dir --import-alias "@/*" --no-eslint`. Después agregás Tailwind v4 manualmente si la CLI no lo trae. La home es un placeholder `Hello Virus` — la UI real la construye T4.
- **`apps/worker`**: package TS plano con script `dev` que corre `tsx watch src/index.ts`. Solo skeleton; las funciones Inngest las arma T2-P07.
- **`packages/shared`**: TS package con `src/index.ts` exportando `{}`. Build con `tsup`.
- **`packages/db`**: TS package; instala `@supabase/supabase-js` y `supabase` (CLI). Crea `migrations/.gitkeep` y `seed.sql` vacío.
- **`packages/remotion`**: corre `pnpm create video --skip-install` o equivalente. Si la CLI no funciona, init manual con `remotion`, `@remotion/cli`, `react`, `react-dom` ya en deps.

### Variables de entorno (`.env.example`)

```env
# === SUPABASE ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=

# === ANTHROPIC (Claude API) ===
ANTHROPIC_API_KEY=

# === ELEVENLABS ===
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=                # voice clone de Manuel

# === ASSEMBLYAI (captions) ===
ASSEMBLYAI_API_KEY=

# === AWS (Remotion Lambda) ===
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
REMOTION_LAMBDA_FUNCTION_NAME=
REMOTION_S3_BUCKET=

# === INNGEST ===
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# === APP ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Scripts en root `package.json`

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "format": "prettier --write ."
  }
}
```

### Verificación

Antes de marcar como done, ejecutá:

```bash
pnpm install
pnpm typecheck    # debe pasar (puede haber 0 archivos TS aún)
pnpm dev          # debe levantar Next en :3000
```

Si algo falla, arreglalo antes de terminar.

### Notas

- NO instales dependencias de feature (Supabase client, ElevenLabs, etc.) — eso lo hace cada prompt cuando las necesite. Vos solo dejás el esqueleto.
- NO escribas componentes UI ni rutas — solo el placeholder "Hello Virus".
- NO crees migraciones — eso es T2-P01.
- NO toques `.env.local` — solo `.env.example`.
- Asegurate de que el repo NO tenga `.git` inicializado todavía (Manuel decide cuándo hacer git init).

### Output esperado

Estructura de carpetas creada, `pnpm install` exitoso, `pnpm dev` levanta `apps/web` en `localhost:3000` mostrando "Hello Virus". Otros agentes pueden empezar a agregar código en sus carpetas asignadas sin pisarte.
