---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: database-architect
tanda: 1
depende-de: []
file-ownership:
  - packages/db/migrations/0001_init.sql
  - packages/db/migrations/0002_rls.sql
  - packages/db/migrations/0003_indexes.sql
  - packages/db/migrations/0004_storage_buckets.sql
  - packages/db/seed.sql
  - packages/db/README.md
duracion-estimada: 75 min
---

# T1-P02 — Diseño del schema de Supabase (multi-proyecto)

## Contexto

Estamos construyendo "Virus", sistema autónomo y **multi-proyecto** de generación de videos virales. El schema tiene que soportar que un mismo usuario tenga N proyectos (APEX-dev, Assistify, ChatBot, etc.), cada uno con sus archivos de patrones virales, info de marca, historial y videos.

Lee primero:
- `prompts/00-ARCHITECTURE.md` — sección "Modelo de datos" y "Concepto: Proyecto" tienen la versión inicial. Tu trabajo es **convertirla en SQL production-grade**.
- `proyecto.md` — research de virales (sirve como referencia + se vuelca como seed del proyecto default APEX-dev en T1-P08).

NO leas otros prompts.

## Tarea

Escribir migraciones SQL listas para correr con Supabase CLI:

1. **`0001_init.sql`** — DDL: extensions, tablas, foreign keys, check constraints, triggers de `updated_at`.
2. **`0002_rls.sql`** — Row Level Security: enable RLS y policies por tabla.
3. **`0003_indexes.sql`** — índices que importan en queries previstas.
4. **`0004_storage_buckets.sql`** — declarar buckets `project-files`, `videos`, `audio`, `thumbnails` con sus policies (SELECT/INSERT/DELETE solo si dueño del proyecto).

Y un `seed.sql` que inserte:
- Una entrada en `viral_hooks_seed` para cada uno de los 30 hooks de `proyecto.md §3` con `niche='dev/software'`. (El seed completo del proyecto default APEX-dev lo arma T1-P08.)
- Los **3 pilares default** como template (no atados a proyecto — son referencia para el wizard).

## Decisiones que tenés que tomar (libre albedrío con justificación)

1. **Aislamiento entre proyectos**: usar `project_id` como FK + RLS via JOIN con `projects.user_id`. Decidir si todas las RLS hacen JOIN o si denormalizar `user_id` en cada tabla. **Recomendación esperada: denormalizar `user_id` en `videos`, `video_ideas`, `project_used_signatures`, `video_performance` para policies más simples y rápidas. Mantener `project_id` como FK fuerte igual.**
2. **Enums vs lookup tables**: para `video_format`, `video_status`, `pillar_type`, `platform`, `language`, `project_file.kind`, `project.status`. Decidí (los enums son cómodos pero rígidos para migrar).
3. **JSONB vs columnas tipadas**: `script`, `captions`, `project_patterns.hooks`, `project_brand.value_props` son estructuras complejas/variables → JSONB. `videos.status`, `projects.slug` son cortos y consultados → columnas tipadas.
4. **Versionado de archivos del proyecto**: `project_files` tiene `version` incremental por `(project_id, kind)`. Solo una versión `is_current=true` en `project_patterns` y `project_brand` por proyecto.
5. **Soft delete**: `deleted_at` en `videos`, `video_ideas`, `projects`. NUNCA hard-delete proyectos (cascade rompería historial valioso).
6. **Anti-repetición**: tabla `project_used_signatures` con hashes (sha256 corto) de hook/topic/angle. Index por `(project_id, used_at DESC)` para queries de "últimos 14 días".

Cada decisión documentala en un comentario SQL al inicio del archivo.

## Tablas requeridas (mínimo, podés agregar)

Ver `prompts/00-ARCHITECTURE.md` sección "Modelo de datos". Cubre como mínimo:

- `profiles` (1:1 con `auth.users`, on `INSERT auth.users → trigger crea profile`)
- `projects` (NEW — multi-tenant interno por user)
- `project_files` (NEW — archivos subidos versionados)
- `project_patterns` (NEW — patrones parseados, `is_current` flag)
- `project_brand` (NEW — info parseada, `is_current` flag)
- `content_pillars` (project-scoped)
- `viral_hooks_seed` (catálogo público, no project-scoped)
- `video_ideas` (project-scoped)
- `videos` (project-scoped)
- `project_used_signatures` (NEW — anti-repetición por proyecto)
- `video_performance`
- `job_events`

Y agregá lo que veas necesario. Justificá adiciones.

## Queries previstas (optimizá índices para esto)

```sql
-- 1. Listar proyectos del user con KPIs (videos en cola, último publicado)
SELECT p.id, p.slug, p.name, p.theme_color,
       COUNT(v.id) FILTER (WHERE v.status IN ('pending','scripting','audio','rendering')) AS in_queue,
       MAX(v.published_at) AS last_published
FROM projects p
LEFT JOIN videos v ON v.project_id = p.id AND v.deleted_at IS NULL
WHERE p.user_id = $1 AND p.status = 'active'
GROUP BY p.id ORDER BY p.updated_at DESC;

-- 2. Contexto de generación (load completo de un proyecto)
SELECT p.*, pp.*, pb.*
FROM projects p
LEFT JOIN project_patterns pp ON pp.project_id = p.id AND pp.is_current
LEFT JOIN project_brand pb ON pb.project_id = p.id AND pb.is_current
WHERE p.id = $1 AND p.user_id = $2;

-- 3. Hooks/topics/ángulos usados últimos 14 días (anti-repetición)
SELECT hook_hash, topic_hash, angle_hash, format
FROM project_used_signatures
WHERE project_id = $1 AND used_at > NOW() - INTERVAL '14 days';

-- 4. Próximo video a renderizar (scheduler)
SELECT * FROM videos
WHERE project_id = $1 AND status = 'ready' AND scheduled_for <= NOW() AND deleted_at IS NULL
ORDER BY scheduled_for ASC LIMIT 1;

-- 5. Pipeline status por proyecto (dashboard live)
SELECT status, COUNT(*) FROM videos
WHERE project_id = $1 AND deleted_at IS NULL GROUP BY status;

-- 6. Performance promedio últimos 30 días por proyecto
SELECT AVG(views), AVG(saves), AVG(hook_retention)
FROM video_performance vp
JOIN videos v ON v.id = vp.video_id
WHERE v.project_id = $1 AND vp.measured_at > NOW() - INTERVAL '30 days';

-- 7. Calendario de scheduled videos por proyecto
SELECT id, scheduled_for, template, status FROM videos
WHERE project_id = $1 AND scheduled_for BETWEEN $2 AND $3 AND deleted_at IS NULL;

-- 8. Listar archivos subidos (con versiones) por proyecto
SELECT * FROM project_files WHERE project_id = $1 ORDER BY kind, version DESC;
```

## RLS — reglas

- **`projects`**: `auth.uid() = user_id` para todo.
- **`project_files`, `project_patterns`, `project_brand`, `content_pillars`, `video_ideas`, `videos`, `project_used_signatures`**: `auth.uid() = (SELECT user_id FROM projects WHERE id = project_id)` — o `auth.uid() = user_id` si denormalizaste user_id en la tabla (más rápido).
- **`viral_hooks_seed`**: SELECT público para users autenticados; INSERT/UPDATE/DELETE solo `service_role`.
- **`job_events`**, **`video_performance`**: SELECT solo si el user es dueño del video referenciado.
- Service role bypass en todas (Inngest worker corre con service role).

## Triggers obligatorios

- `update_updated_at_column()` genérico.
- `handle_new_user()`: en INSERT a `auth.users`, crear `profiles` con defaults (language 'es-AR'). NO crea proyecto default — el wizard lo hace.
- `set_project_user_id()`: en INSERT a `videos`/`video_ideas`/`project_used_signatures`/etc., copiar `user_id` desde `projects` (si denormalizaste).
- `enforce_single_current_pattern()`: trigger BEFORE INSERT/UPDATE en `project_patterns` y `project_brand` que setea `is_current=false` en filas viejas del mismo `(project_id)` cuando una nueva entra como current.

## Storage buckets (en `0004_storage_buckets.sql`)

```sql
-- project-files
INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', false);
-- videos, audio, thumbnails: idem (private)

-- Policy ejemplo (project-files)
CREATE POLICY "Users can read own project files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE user_id = auth.uid()
    )
  );
-- Repetir patrón para INSERT/UPDATE/DELETE.
```

## Output esperado

- 4 archivos SQL en `packages/db/migrations/` que corran sin error con `supabase db reset`.
- `seed.sql` que carga los 30 hooks en `viral_hooks_seed` y pilares template.
- `README.md` corto explicando cómo correr migraciones (`supabase start`, `supabase db push`, `supabase db reset`) y cómo testear las RLS con `supabase test`.

## Verificación

```bash
cd packages/db
supabase start
supabase db reset
psql $DB_URL -c "SELECT count(*) FROM viral_hooks_seed"  # debe ser 30
psql $DB_URL -c "\d projects"                            # tabla existe
psql $DB_URL -c "\d project_files"                       # tabla existe
psql $DB_URL -c "\d project_used_signatures"             # tabla existe
```

### Tipos generados

```bash
supabase gen types typescript --local > packages/db/src/types.gen.ts
```

Y exportalos desde `packages/db/src/index.ts`.

## Qué NO hagas

- NO escribas el código que carga el seed APEX-dev (eso es T1-P08).
- NO escribas los parsers de archivos (eso es T2-P09).
- NO escribas el orchestrator (eso es T5-P02 / T5-P05).
