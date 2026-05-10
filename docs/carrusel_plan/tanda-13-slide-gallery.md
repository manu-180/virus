# Tanda 3.13 — UI: SlideGallery con preview y regenerar individual

## Contexto

La página detalle (Tanda 12) tiene un placeholder `<SlideGallery />`. Acá lo implementamos. Component muestra los N slides en grid 4:5, permite ver fullscreen, comparar `image_path` (base) vs `composed_path` (con texto), y regenerar individualmente.

## Pasos

1. **Leer:**
   - `apps/web/src/components/carousels/CarouselDetailView.tsx` (Tanda 12 — cómo embebe SlideGallery).
   - `packages/shared/src/carousel/types.ts` (`CarouselSlide`).
   - shadcn Dialog component (para fullscreen modal).

2. **Crear `apps/web/src/components/carousels/SlideGallery.tsx`** (client):
   - Props: `slides: (CarouselSlide & { signedUrl: string; signedComposedUrl?: string })[]`, `onRegenerate: (idx: number) => Promise<void>`, `onUpdateOverlay?: (idx, text) => Promise<void>` (opcional).
   - Layout:
     - Grid: 2 cols mobile, 3 cols md, 4 cols lg (los slides son 4:5 → encajan bien).
     - Cada card:
       - Imagen `composed` si existe, sino `image` base, sino skeleton.
       - Numerito grande arriba izquierda ("01/08").
       - Pill con `role` ("Hook", "Data", etc.) abajo derecha.
       - Hover: botones overlay [Ver fullscreen] [Regenerar] [Editar texto].
       - Si `status='failed'`: borde rojo + ícono error + botón retry destacado.
       - Si `status='regenerating'`: shimmer overlay.
   - Click en card → abre `<SlideFullscreenModal slide={slide} />`.

3. **Crear `apps/web/src/components/carousels/SlideFullscreenModal.tsx`:**
   - Dialog shadcn fullscreen.
   - Tabs: "Compuesto" (composed) | "Base" (sin texto).
   - Botón "Descargar este slide" → fetch el blob y download.
   - Botón "Regenerar" → `onRegenerate(idx)` → cierra modal.
   - Botón "Editar texto overlay" (avanzado, **opcional v1** — si lo hacés: input que actualiza `overlay_text` vía PATCH `/api/carousels/[id]/slides/[idx]` y vuelve a invocar el composer. Si no lo hacés v1, omitilo).

4. **Regenerate flow**:
   - `onRegenerate(idx)` viene del padre (CarouselDetailView).
   - Padre llama `POST /api/carousels/[id]/slides/[idx]/regenerate` (Tanda 10).
   - Optimistic UI: inmediatamente marcar slide como `regenerating`, mostrar shimmer.
   - Realtime trae el update cuando termina.

5. **Estado vacío** mientras no hay slides aún: 8 cards skeleton con número + shimmer.

6. **Accesibilidad**: cada slide card es `<button>` con `aria-label="Ver slide N"`. Modal con focus trap (shadcn lo hace).

7. **Test manual**:
   - Carrusel completo cargado: ver 8 slides ordenados.
   - Click en uno → modal con tabs.
   - Regenerar un slide → ver shimmer → ver imagen nueva.

8. **Commit:**
   ```
   feat(web): add SlideGallery component with fullscreen modal and per-slide regenerate
   ```

## Constraints

- **NO** cargar imágenes raw del bucket — siempre signed URLs (vienen del endpoint).
- **NO** download cross-origin si las signed URLs no tienen `Content-Disposition` — usá un proxy en `/api/carousels/[id]/slides/[idx]/download` si es necesario (ese endpoint es trivial: server fetch the signed URL, stream con `Content-Disposition: attachment`).
- Imágenes con `loading="lazy"`.

## Done cuando

- Gallery responsiva con preview + fullscreen modal.
- Regenerate single-slide funciona end-to-end.
- Commit hecho.
