---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: [T1-P02, T1-P04, T1-P08, T2-P01, T2-P06]
file-ownership:
  - apps/web/src/server/projects/
  - apps/web/src/server/projects/index.ts
  - apps/web/src/server/projects/actions.ts
  - apps/web/src/server/projects/queries.ts
  - apps/web/src/server/projects/seed.ts
  - apps/web/src/server/projects/upload.ts
  - apps/web/src/server/projects/types.ts
  - apps/web/src/lib/zod/project-schemas.ts
  - apps/web/src/app/api/projects/route.ts
  - apps/web/src/app/api/projects/[id]/route.ts
  - apps/web/src/app/api/projects/[id]/files/route.ts
duracion-estimada: 75 min
---

# T2-P08 — Project CRUD + ingesta de archivos

## Contexto

Cada usuario puede tener N proyectos. Necesitamos endpoints + server actions para crear, listar, actualizar, archivar proyectos, y para subir los 2 archivos clave (`viral_patterns` y `project_info`) a Supabase Storage. El parseo de los archivos lo hace T2-P09 (otro Inngest function); acá solo encolamos.

Lee primero:
- `prompts/00-ARCHITECTURE.md` — sección "Concepto: Proyecto", "Storage", "Pipeline".
- `packages/db/types.gen.ts` (T1-P02) — tipos generados de la DB.
- `packages/shared/src/viral/types.ts` (T1-P04) — `ProjectPatterns`, `ProjectBrand`.
- `packages/shared/src/viral/seeds/index.ts` (T1-P08) — `SEED_APEX_DEV`.
- `apps/web/src/lib/supabase/` (T2-P01) — clients server/client/admin.
- `apps/web/src/lib/storage/` (T2-P06) — helpers de Storage.

## Tarea

### 1. Schemas Zod (`apps/web/src/lib/zod/project-schemas.ts`)

```ts
import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  niche: z.string().min(2).max(50),
  language: z.string().default('es-AR'),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0175C2'),
  voiceCloneId: z.string().optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const UploadProjectFileSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(['viral_patterns', 'project_info']),
});
```

### 2. Server actions (`apps/web/src/server/projects/actions.ts`)

```ts
'use server';

export async function createProject(input: z.infer<typeof CreateProjectSchema>): Promise<Project>;
export async function updateProject(id: string, input: z.infer<typeof UpdateProjectSchema>): Promise<Project>;
export async function archiveProject(id: string): Promise<void>;
export async function listProjects(): Promise<ProjectListItem[]>;
export async function getProject(id: string): Promise<ProjectFull>;
export async function getProjectBySlug(slug: string): Promise<ProjectFull>;

// Bootstrap: en primer login crea el seed APEX-dev si no hay proyectos.
export async function ensureDefaultProject(): Promise<Project>;
```

`ensureDefaultProject()`:
1. Verifica si el user tiene >=1 proyecto.
2. Si NO tiene ninguno, importa `SEED_APEX_DEV` y crea:
   - Row en `projects` con datos del seed.
   - Row en `project_files` (kind=viral_patterns, version=1) marcando que viene del seed (mime `application/json`, `storage_path = 'seed:apex-dev/patterns.json'` — sentinel value).
   - Row en `project_files` (kind=project_info, version=1) idem.
   - Row en `project_patterns` con el JSON inline (`is_current=true`).
   - Row en `project_brand` con el JSON inline (`is_current=true`).
3. Retorna el proyecto.

### 3. Queries (`apps/web/src/server/projects/queries.ts`)

```ts
// Para el dashboard (ver T1-P02 query #1)
export interface ProjectListItem {
  id: string; slug: string; name: string; themeColor: string;
  inQueue: number; lastPublished: string | null;
}
export async function fetchProjectsList(userId: string): Promise<ProjectListItem[]>;

// Para el detail page (carga full)
export interface ProjectFull extends Project {
  patterns: ProjectPatterns | null;     // null si no parseado
  brand: ProjectBrand | null;
  files: ProjectFile[];
  pipelineCount: Record<string, number>;
}
export async function fetchProjectFull(idOrSlug: string, userId: string): Promise<ProjectFull>;
```

### 4. Upload (`apps/web/src/server/projects/upload.ts`)

```ts
export async function uploadProjectFile(input: {
  projectId: string;
  kind: 'viral_patterns' | 'project_info';
  file: File;
}): Promise<{ fileId: string; storagePath: string; version: number }>;
```

Pasos:
1. Verifica auth y ownership del proyecto.
2. Valida MIME (whitelist: `text/markdown`, `text/plain`, `application/json`, `application/pdf`, `image/png`, `image/jpeg`, `image/webp`).
3. Valida tamaño (max 10MB).
4. Calcula próxima `version` (max+1) por `(project_id, kind)`.
5. Sube a Storage: `project-files/{projectId}/{kind}/v{version}.{ext}`.
6. INSERT en `project_files` con `parse_status='pending'`.
7. Dispara Inngest event `project.file.uploaded` con `fileId` (el handler del parser está en T2-P09).
8. Retorna `{ fileId, storagePath, version }`.

### 5. Route handlers REST (opcional pero recomendado, paralelo a server actions)

- `POST /api/projects` — crear
- `GET /api/projects` — listar
- `GET /api/projects/[id]` — detail
- `PATCH /api/projects/[id]` — update
- `DELETE /api/projects/[id]` — archive (soft)
- `POST /api/projects/[id]/files` — upload (multipart/form-data, recibe `kind` + `file`)

Todos validan auth con `createServerClient()` y verifican ownership.

### 6. Tipos compartidos (`apps/web/src/server/projects/types.ts`)

Re-exports tipados de `Project`, `ProjectFile`, `ProjectFull`, `ProjectListItem`. Importa de `packages/db/types.gen.ts` y `@virus/shared/viral/types`.

## Reglas

- **Auth check primero**: cada función verifica `auth.uid()` y matchea `projects.user_id`. NO confiar en RLS solamente — fallar temprano con 403.
- **Slugs únicos por user**: si Manuel intenta crear un proyecto con slug duplicado, fallar con error legible.
- **Soft delete**: `archiveProject` setea `status='archived'`, no borra. `listProjects` filtra `status='active'` por default.
- **Idempotencia de `ensureDefaultProject`**: si ya existe `apex-dev` para ese user, NO duplicarlo. Buscar por `(user_id, slug='apex-dev')` y retornar.
- **Errores**: usar shape `{ ok: false, error: { code, message } }` consistente.

## Qué NO hagas

- NO parsees archivos acá. Solo subir + encolar evento Inngest. El parseo es T2-P09.
- NO toques `apps/worker/` (es de T2-P09).
- NO escribas UI (eso es T4-P08/P09/P10).

## Output esperado

API completa para gestionar proyectos. `ensureDefaultProject()` funciona end-to-end. Upload sube a Storage + crea row + dispara evento.

## Verificación

```bash
cd apps/web
pnpm test src/server/projects/
pnpm typecheck
```

Test E2E mínimo: crear proyecto → listar → upload archivo dummy → verificar que `project_files` tiene la row con `parse_status='pending'`.
