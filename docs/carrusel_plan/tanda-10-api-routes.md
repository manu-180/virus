# Tanda 3.10 — API routes Next.js: CRUD carruseles + acciones

## Contexto

Pipeline funciona end-to-end vía worker (Tandas 5-9). Ahora exponemos endpoints REST en `apps/web/src/app/api/carousels/` que la UI (Tandas 11-14) va a consumir. La web **solo despacha eventos** y lee/escribe DB; el worker hace el trabajo pesado.

## Pasos

1. **Leer:**
   - `apps/web/src/app/api/generate/route.ts` (patrón POST con dispatch).
   - `apps/web/src/app/api/projects/route.ts` (patrón GET con RLS + Supabase server client).
   - `apps/web/src/app/api/videos/[id]/retry/route.ts` (patrón retry).
   - `apps/web/src/lib/supabase/server.ts` (cómo se obtiene el client server).
   - El ADR — sección API surface.

2. **Crear endpoints:**

   - `apps/web/src/app/api/carousels/route.ts`:
     - `POST`: body Zod-validado (`brief: CarouselBrief`, `projectId: string`). Inserta en `carousel_projects` con `user_id = session.user.id` y `status='pending'`. Despacha `virus/carousel.created`. Devuelve `201 { id }`.
     - `GET`: lista carruseles del user, ordenados desc por `created_at`. RLS filtra. Devuelve `{ items: CarouselListRow[] }` (proyectá solo columnas que la UI muestra).

   - `apps/web/src/app/api/carousels/[id]/route.ts`:
     - `GET`: detalle con join a `carousel_slides` (orderBy idx) y `carousel_captions` (orderBy variant_idx). Devuelve `{ project, slides, captions }`. Adjuntá signed URLs para `image_path` y `composed_path` (TTL 1h).
     - `DELETE`: soft delete (`deleted_at = now()`).

   - `apps/web/src/app/api/carousels/[id]/retry/route.ts`:
     - `POST`: Determina último step OK leyendo status. Resetea a status anterior y despacha el evento correspondiente. Mismo patrón que `videos/retry`.

   - `apps/web/src/app/api/carousels/[id]/slides/[idx]/regenerate/route.ts`:
     - `POST`: marca el slide `status='regenerating'`, despacha un evento custom `virus/carousel.slide.regenerate.requested` (agregalo al schema; el worker debe tener una función nueva o extender `generate-carousel-slides` para procesar single-slide). **Esta tanda incluye implementar esa función worker breve también.**

   - `apps/web/src/app/api/carousels/[id]/captions/[variant]/select/route.ts`:
     - `POST`: en transacción, set `selected=false` en todas las captions del carrusel y `selected=true` en la indicada.

   - `apps/web/src/app/api/carousels/[id]/export/route.ts`:
     - **No implementar full acá** — dejá un stub que devuelve 501. Tanda 15 lo termina.

3. **Validación**: cada endpoint usa Zod schemas — definilos en `apps/web/src/lib/validators/carousels.ts` (reusable client+server). Errores → 400 con `{ error, details }`.

4. **Auth**: cada endpoint chequea `session = await getSession()`. Si null → 401. Las queries usan el client server, RLS hace el resto.

5. **Worker addition (mini)**: agregá a `apps/worker/src/functions/generate-carousel-slides.ts` un nuevo trigger handler para `virus/carousel.slide.regenerate.requested` que regenera SOLO el slide indicado y lo recompone. Reutilizá las funciones existentes de Tandas 5-7. Re-emite `virus/carousel.completed` (o `failed`).

6. **Tests** en `apps/web/src/app/api/carousels/__tests__/`:
   - POST devuelve 201 con id válido.
   - POST con brief inválido → 400.
   - GET sin sesión → 401.
   - GET de un carrusel de otro user → 404 (RLS lo bloquea, traducí a 404 para no leakear existencia).

7. **E2E manual:**
   ```powershell
   # con worker + inngest dev + web corriendo
   curl -X POST http://localhost:3002/api/carousels -H "Cookie: <auth-cookie>" -d '{"brief":{...},"projectId":"<uuid>"}'
   # esperá ~60s
   curl http://localhost:3002/api/carousels/<id>
   ```

8. **Commit:**
   ```
   feat(web): add carousels API routes (CRUD + retry + regenerate + select-caption)
   ```

## Constraints

- **NO** servir funciones Inngest desde la web — solo `inngest.send`.
- **NO** exponer `image_path` raw en GET — siempre signed URL.
- **NO** copiar lógica de business al endpoint — los endpoints son thin: validar, dispatch, return.
- Cada endpoint cabe en <80 líneas. Si crece, partilo.

## Done cuando

- 6 endpoints + 1 worker handler nuevo.
- Tests de happy/error path verdes.
- E2E manual: POST → genera carrusel → GET trae todo con signed URLs.
- Commit hecho.
