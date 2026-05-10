# Tanda 4.16 — UI: lista `/dashboard/carousels` + nav link

## Contexto

Manuel necesita ver todos los carruseles que generó, su estado, miniatura, y poder entrar a cualquiera. También un CTA grande para crear nuevo.

## Pasos

1. **Leer:**
   - `apps/web/src/app/(dashboard)/dashboard/page.tsx` (home dashboard) y `apps/web/src/app/(dashboard)/dashboard/pipeline/page.tsx` (lista similar para videos).
   - El layout `apps/web/src/app/(dashboard)/layout.tsx` y la nav.

2. **Crear `apps/web/src/app/(dashboard)/dashboard/carousels/page.tsx`** (server component):
   - Fetch `GET /api/carousels` (vía supabase server, no via API route — más rápido).
   - Renderizar `<CarouselsList items={items} />`.
   - Empty state: ilustración + CTA grande "Crear primer carrusel" linkeando a `/dashboard/carousels/new`.

3. **Crear `apps/web/src/components/carousels/CarouselsList.tsx`** (server o client, depende; preferí server):
   - Header: título "Carruseles" + botón primario "Nuevo" → `/dashboard/carousels/new`.
   - Filtros simples: select status (`all | ready | failed | in-progress`) — query param con shallow router.
   - Grid de cards 2-4 cols:
     - Thumbnail = `composed_path` del slide 0 con signed URL (resaltado 4:5).
     - Title = `brief.topic` truncado.
     - Status pill.
     - Project name (badge).
     - Date (`RelativeTime` componente que ya existe — buscalo en `apps/web/src/components/`).
     - Click → navega a `/dashboard/carousels/[id]`.

4. **Performance**: paginación o infinite scroll si >50 items. v1: server-side query con limit 50.

5. **Nav link**: agregar "Carruseles" en la navegación principal (sidebar o navbar — buscá el componente nav). Ícono apropiado de lucide (`Images` o `LayoutGrid`).

6. **Test manual**:
   - Crear 2 carruseles → ir a `/dashboard/carousels` → ver ambos con thumbnail correcta.
   - Click en uno → navega al detalle.
   - Empty state cuando no hay ninguno.

7. **Commit:**
   ```
   feat(web): add carousels listing page and main nav link
   ```

## Constraints

- **NO** cargar imágenes full size en la lista — pedile al backend `?thumb=1` o usá `next/image` con `sizes` correcto. Actualmente las signed URLs son del bucket directo; mientras siga siendo eficiente está OK v1.
- Los carruseles soft-deleted no aparecen.

## Done cuando

- Lista con thumbs y filtros.
- Nav link visible.
- Empty state cuando no hay items.
- Commit hecho.
