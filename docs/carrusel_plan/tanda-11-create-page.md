# Tanda 3.11 — UI: página `/dashboard/carousels/new` (form de creación)

## Contexto

Endpoints listos (Tanda 10). Ahora la página donde Manuel completa el brief y arranca un carrusel. Stack UI: Next.js 15 App Router + shadcn + Tailwind + react-hook-form + Zod.

## Pasos

1. **Leer:**
   - `apps/web/src/app/(dashboard)/dashboard/projects/[id]/page.tsx` (estructura de page con server data).
   - `apps/web/src/app/onboarding/_steps/step-voice.tsx` (patrón de form complejo con hook-form + Zod).
   - Componentes shadcn ya instalados en `apps/web/src/components/ui/` (Form, Input, Select, Textarea, Button, Slider).
   - `apps/web/src/lib/validators/carousels.ts` (Tanda 10).

2. **Crear `apps/web/src/app/(dashboard)/dashboard/carousels/new/page.tsx`:**
   - Server component que carga la lista de `projects` del user (para el picker) — query Supabase server.
   - Renderiza `<NewCarouselForm projects={projects} />` (client component).

3. **Crear `apps/web/src/components/carousels/NewCarouselForm.tsx`** (client component):
   - Campos:
     - `projectId` — Select con la lista de proyectos (default = primer proyecto del user).
     - `topic` — Textarea (placeholder: "Ej: 5 errores que hacen que tu sitio web no venda").
     - `angle` — Select: `educational | contrarian | story-arc | before-after | listicle`.
     - `tone` — Select: `direct | authoritative | casual | contrarian`.
     - `slideCount` — Slider 3..10 (default 8). Mostrar el número actual.
     - `stylePreset` — RadioGroup con 3 cards `minimal | bold | editorial`. Cada card incluye una mini-preview (PNG estático en `/public/carousel-presets/{preset}.png` — generalo de antemano usando el script de Tanda 7 y commitealo, son 3 imágenes pequeñas).
     - `language` — Select `es | en` (default `es`).
     - `cta` — Input ("Ej: DM 'WEB' para auditoría gratis").
   - Validación con Zod (mismo schema que el del endpoint).
   - Submit: `POST /api/carousels` → si 201, redirect a `/dashboard/carousels/[id]` con id devuelto.
   - Loading state: botón disabled + spinner. Error → toast (sonner ya está instalado, verificá).

4. **Pre-llenado inteligente**: cuando el user cambia `projectId`, hacé un fetch a `/api/projects/[id]` y pre-llená `audience` y `cta` con datos del `project_brand` (si existen). Manuel puede sobrescribir.

5. **Estimador de costo** en vivo: a la derecha del form, mostrá un card con:
   - "Costo estimado: $X.XX USD" calculado con `estimateCarouselCost` de `packages/shared/src/carousel/cost.ts`.
   - "Tiempo estimado: 60-90 segundos".

6. **Mobile-friendly**: form en columna única en mobile, dos columnas (form izquierda + estimador derecha) ≥ md.

7. **Test (Playwright si está configurado, sino manual):**
   - Cargar la página → ver 3 preset cards.
   - Submit con campos requeridos vacíos → ver mensajes de error inline.
   - Submit válido → redirige a la página de detalle.

8. **Commit:**
   ```
   feat(web): add new carousel form page with project context, presets and cost estimator
   ```

## Constraints

- **NO** llamar Gemini desde el form — solo `POST /api/carousels`.
- **NO** UI muy custom — usar shadcn primitives. Mantener consistencia con el resto del dashboard.
- Mostrar error claro si el user no tiene proyectos creados → CTA "Crear proyecto primero" linkeando a `/dashboard/projects/new`.

## Done cuando

- Página `/dashboard/carousels/new` accesible.
- Submit dispara API y redirige.
- Las 3 preset previews son imágenes reales (no placeholders).
- Mobile responsive.
- Commit hecho.
