# Tanda 3.12 — UI: página `/dashboard/carousels/[id]` con realtime de Supabase

## Contexto

Después de submit del form (Tanda 11), redirigimos a esta página. Acá el user ve:
- Status del pipeline en vivo (pending → generating_slides → composing → generating_captions → ready).
- Slides apareciendo a medida que se generan.
- Captions cuando ready.
- Acciones: regenerar slide, elegir caption, descargar ZIP, eliminar.

Realtime: usar Supabase Realtime (channels) sobre `carousel_projects` + `carousel_slides`.

## Pasos

1. **Leer:**
   - `apps/web/src/app/(dashboard)/dashboard/pipeline/page.tsx` (patrón realtime con `videos`).
   - Documentación interna del realtime client en `apps/web/src/lib/supabase/`.
   - Tanda 13 (gallery) y 14 (caption picker) — esos componentes los embeberá esta página, **acá los maquetás como placeholders y los reemplazás cuando se hagan en sus tandas, o los dejás vacíos hasta entonces**.

2. **Crear `apps/web/src/app/(dashboard)/dashboard/carousels/[id]/page.tsx`** (server component):
   - Fetch inicial: `GET /api/carousels/[id]` → `{ project, slides, captions }`.
   - Si no existe → 404.
   - Renderizar `<CarouselDetailView initialData={data} />`.

3. **Crear `apps/web/src/components/carousels/CarouselDetailView.tsx`** (client):
   - Estado local con `initialData`.
   - Subscripción a 2 channels:
     - `carousel_projects:id=eq.${id}` — actualiza `status`.
     - `carousel_slides:carousel_id=eq.${id}` — actualiza/inserta slides.
   - Layout:
     - Header: título (`brief.topic`), status pill, fecha, botón "Eliminar" (con confirm).
     - **Status timeline** horizontal con 5 stops: Pending → Generating slides → Composing → Captions → Ready. El stop activo animado, los completados ✓.
     - **Slide gallery** (placeholder por ahora — `<SlideGallery slides={slides} onRegenerate={...} />`. Lo implementa Tanda 13.)
     - **Caption picker** (placeholder — `<CaptionPicker captions={captions} carouselId={id} />`. Lo implementa Tanda 14.)
     - **Bottom bar**: botón "Descargar ZIP" (disabled hasta status=ready) → `GET /api/carousels/[id]/export` (Tanda 15 lo implementa, hasta entonces 501 → mostrá toast).

4. **Manejo de error/failed:**
   - Si `status='failed'`, mostrar banner rojo con el último error y botón "Reintentar" → `POST /api/carousels/[id]/retry`.
   - Mostrá `error` jsonb del último slide failed si lo hay.

5. **Polling fallback**: si el realtime no llega (a veces Supabase RT tiene lag), polling cada 5s GET hasta que `status` sea `ready` o `failed`.

6. **Loading skeletons** mientras los slides aún no llegan: mostrá 8 placeholders 4:5 con shimmer.

7. **Test manual**: crear un carrusel desde el form → verificar que la página detalle se va llenando en vivo (los slides aparecen uno a uno conforme el worker los genera).

8. **Commit:**
   ```
   feat(web): add carousel detail page with realtime status timeline
   ```

## Constraints

- **NO** hacer fetch sincrónico cada vez — usar realtime + initial fetch + polling fallback.
- **NO** subscribirse a tablas de otros users (RLS lo previene pero igual filtrá explícito).
- Usar React Suspense para los placeholders shimmer si encaja.
- Limpiar la subscripción al desmontar (return cleanup en useEffect).

## Done cuando

- Página detalle muestra status en vivo.
- Slides aparecen progresivamente.
- Botón retry funciona en failed state.
- Commit hecho.
