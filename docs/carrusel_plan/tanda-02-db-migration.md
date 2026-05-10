# Tanda 1.02 — Migration SQL: tablas + bucket de carruseles

## Contexto

Stack: monorepo en `C:\MisProyectos\Armagedon\virus`. Migrations SQL viven en `packages/db/migrations/` ordenadas por número (ya van en `0018`). Cada migration es un único archivo `.sql` idempotente cuando es razonable. Las tablas tienen `user_id` denormalizado para RLS con `auth.uid()`.

Tarea anterior generó `docs/carrusel_plan/ADR.md` con el data model exacto. Si hay conflicto entre este prompt y el ADR, **gana el ADR**.

## Pasos

1. **Leer:**
   - `docs/carrusel_plan/ADR.md` (data model exacto).
   - `packages/db/migrations/0001_init.sql` (patrón de tablas).
   - `packages/db/migrations/0002_rls.sql` (patrón RLS).
   - `packages/db/migrations/0014_visual_assets.sql` (patrón de assets-related tables).
   - `packages/db/migrations/0004_storage_buckets.sql` y `0015_visual_assets_bucket.sql` (patrón de bucket policies).

2. **Crear migration `packages/db/migrations/0019_carousel_tables.sql`** con:
   - `create table public.carousel_projects` (todas las columnas del ADR; `status` CHECK constraint con valores válidos; `brief jsonb not null`; `slide_count int not null default 8 check (slide_count between 3 and 10)`; `style_preset text not null default 'minimal'`; `created_at`, `updated_at` con triggers; `deleted_at`).
   - `create table public.carousel_slides` (FK a `carousel_projects.id` ON DELETE CASCADE; `idx int`; UNIQUE `(carousel_id, idx)`; `image_path text`, `composed_path text`, `overlay_text text`, `prompt text`, `status text`, `error jsonb`, timestamps).
   - `create table public.carousel_captions` (FK; `variant_idx int`; UNIQUE `(carousel_id, variant_idx)`; `framework text`, `text text`, `selected bool default false`).
   - Índices: `(user_id, status)` en projects; `(carousel_id, idx)` en slides; `(carousel_id, variant_idx)` en captions.
   - Triggers `updated_at` reusando función `set_updated_at()` si ya existe en migrations previas (verificá; si no existe, copiala con CREATE OR REPLACE FUNCTION).

3. **Crear migration `packages/db/migrations/0020_carousel_rls.sql`** con:
   - `alter table ... enable row level security` para las 3 tablas.
   - Policies por SELECT/INSERT/UPDATE/DELETE usando `user_id = auth.uid()` directamente (igual patrón que `0002_rls.sql`).
   - Para `carousel_slides` y `carousel_captions` los `user_id` vienen denormalizados desde `carousel_projects` — incluí columna `user_id` en esas tablas también (más simple que joins en RLS) y un trigger que la copia desde el parent al insertar.

4. **Crear migration `packages/db/migrations/0021_carousels_bucket.sql`** con:
   - `insert into storage.buckets (id, name, public) values ('carousels_bucket', 'carousels_bucket', false)` ON CONFLICT DO NOTHING.
   - 4 policies de storage (SELECT/INSERT/UPDATE/DELETE) que verifican que el primer segmento del path = `auth.uid()::text`. Mirá `0015_visual_assets_bucket.sql` para el pattern exacto.

5. **Aplicar migrations localmente:**
   ```powershell
   pnpm --filter @virus/db migrate:local
   ```
   (Si el script no existe, ejecutá `supabase db reset` en el directorio `packages/db` o el que corresponda — buscá en `packages/db/package.json` el script real).

6. **Verificar con MCP de Supabase** (si está configurado para el proyecto local) o con `psql`:
   - `select table_name from information_schema.tables where table_schema='public' and table_name like 'carousel_%';` debe devolver 3 filas.
   - `select id from storage.buckets where id='carousels_bucket';` debe devolver 1 fila.
   - `select policyname from pg_policies where tablename like 'carousel_%';` ≥ 12 policies (4 por tabla).

7. **Regenerar types:**
   ```powershell
   pnpm --filter @virus/db gen:types
   ```
   Verificá que `packages/shared/src/db/database.types.ts` (o donde estén los types) ahora incluye `carousel_projects`, `carousel_slides`, `carousel_captions`. Commiteá los types regenerados también.

8. **Commit (uno por migration está bien, o uno solo si preferís):**
   ```
   feat(db): add carousel tables, RLS, and storage bucket
   chore(db): regenerate types after carousel migrations
   ```

## Constraints

- **No** modificar migrations existentes. Solo agregar nuevas con números siguientes.
- **No** crear seeds todavía.
- **No** romper el video pipeline — verificá que las migrations no tocan `videos`, `visual_assets`, `video_assets_used`.
- Las migrations deben ser idempotentes donde es razonable (`if not exists`, `on conflict do nothing`).
- Numeración: si ya hay un `0019_*.sql` por algún motivo, usá `0022_*.sql` etc — respetá el orden real.

## Done cuando

- 3 migrations nuevas commiteadas.
- Types regenerados y commiteados.
- `pnpm --filter @virus/db migrate:local` corre limpio.
- Las queries de verificación devuelven lo esperado.
- `git status` limpio.
