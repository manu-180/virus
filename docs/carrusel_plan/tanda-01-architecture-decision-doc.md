# Tanda 1.01 — Architecture Decision Doc para sección Carruseles

## Contexto del proyecto (leer primero)

Estás trabajando en el monorepo en `C:\MisProyectos\Armagedon\virus`. Es una herramienta personal de Manuel Navarro (APEX) para generar contenido viral. **Hoy genera videos** (Inngest worker + Remotion Lambda). Vamos a agregar un **carril paralelo de carruseles de Instagram** sin tocar el carril de videos.

Stack: Next.js 15 App Router, pnpm + Turbo, Supabase (auth+DB+storage+RLS), Inngest (worker separado en `apps/worker`), shadcn+Tailwind, TS strict.

Ya existe en la DB el onboarding de marca (tabla `project_brand` con audience, value props, do_not_say) y patterns virales (`project_patterns`). Las imágenes se generarán con `Gemini 2.5 Flash Image` reutilizando el client en `packages/shared/src/visuals/providers/gemini.ts`.

## Tarea

Escribir un **Architecture Decision Doc (ADR)** que será la fuente de verdad para todas las tandas siguientes. Va en `docs/carrusel_plan/ADR.md` (mismo directorio, NO subcarpeta — el resto de archivos del plan ya están ahí).

## Pasos

1. **Leer estos archivos para no contradecir lo existente:**
   - `docs/architecture-overview.md`
   - `docs/carrusel_plan/00-README.md` (ya tiene decisiones high-level locked)
   - `packages/db/migrations/0001_init.sql` (entender naming de tablas)
   - `packages/db/migrations/0014_visual_assets.sql` (entender patrón de assets)
   - `packages/db/migrations/0004_storage_buckets.sql` (entender patrón de buckets+RLS)
   - `packages/inngest/src/client.ts` y los archivos de eventos en `packages/inngest/src/`
   - `packages/shared/src/visuals/providers/gemini.ts`
   - `packages/shared/src/visuals/providers/index.ts`
   - `apps/worker/src/functions/generate-visual-assets.ts` (patrón de función worker)
   - `apps/web/src/app/api/generate/route.ts` (patrón de API que despacha eventos)

2. **Escribir el ADR** en `docs/carrusel_plan/ADR.md` cubriendo:
   - **Goal & non-goals** (1 párrafo).
   - **Data model**: definir las tablas exactas con columnas, FKs y RLS:
     - `carousel_projects` (id, user_id, project_id FK, status, brief, slide_count, style_preset, created_at, ...).
     - `carousel_slides` (id, carousel_id FK, idx, prompt, image_path, overlay_text, status, error, ...).
     - `carousel_captions` (id, carousel_id FK, variant_idx, text, framework, selected boolean).
     - Indexar por `user_id`, `carousel_id`, `(carousel_id, idx)`.
   - **Storage**: bucket `carousels_bucket` con path `{user_id}/{carousel_id}/slide-{idx}.png` y `{user_id}/{carousel_id}/composed-{idx}.png`. Public read NO; signed URLs.
   - **Eventos Inngest** (todos prefijo `virus/carousel.`):
     - `virus/carousel.created` → dispara worker
     - `virus/carousel.brief.ready` → genera slides
     - `virus/carousel.slide.generated` (per slide)
     - `virus/carousel.slides.composed` → composer overlay
     - `virus/carousel.caption.requested` → genera 3 captions
     - `virus/carousel.completed`
     - `virus/carousel.failed`
   - **State machine**: estados de `carousel_projects.status`: `pending → generating_slides → composing → generating_captions → ready → published_manually` (también `failed`). Diagrama en pseudocódigo o Mermaid.
   - **API surface** (apps/web):
     - `POST /api/carousels` → crea row + dispara `virus/carousel.created` → 201 con id
     - `GET /api/carousels` → lista del user (RLS lo filtra)
     - `GET /api/carousels/[id]` → detalle con slides+captions
     - `POST /api/carousels/[id]/retry` → reset desde último step OK
     - `POST /api/carousels/[id]/slides/[idx]/regenerate`
     - `POST /api/carousels/[id]/captions/[variant]/select`
     - `GET /api/carousels/[id]/export` → stream ZIP
   - **Web routes**:
     - `/(dashboard)/dashboard/carousels` → lista
     - `/(dashboard)/dashboard/carousels/new` → form crear
     - `/(dashboard)/dashboard/carousels/[id]` → detalle/preview
   - **Worker functions** (`apps/worker/src/functions/`):
     - `generate-carousel-slides.ts`
     - `compose-carousel-overlay.ts`
     - `generate-carousel-caption.ts`
     - `handle-carousel-failure.ts` (o extender `handle-failure.ts`)
   - **Shared module** (`packages/shared/src/carousel/`):
     - `types.ts`, `prompts.ts`, `templates.ts`, `composer.ts`, `cost.ts`
   - **Decisiones clave con justificación** (1-3 líneas cada una):
     - Gemini 2.5 Flash Image vs Imagen 4 Fast → elegimos Gemini para reuse del client existente y soporte 4:5 nativo
     - Inngest vs Trigger.dev → Inngest, ya está
     - Satori+Sharp vs Puppeteer → Satori, sin headless browser
     - Slide count default = 8 (sweet spot IG 2025-2026)
     - Aspect ratio 4:5 fijo (no configurable v1)
   - **Out of scope v1**: publicación automática a Instagram, scheduling, A/B test de captions, multi-idioma (solo ES por ahora).
   - **Riesgos & mitigaciones**: tabla con 4-6 filas (ej: rate limit Gemini → retry exponencial; texto largo no entra → truncar y warn; etc.).
   - **Cost model**: ~8 slides × $0.0195 + ~$0.05 captions = **~$0.20 por carrusel**.

3. **Verificar:**
   - El doc no contradice nada en `docs/carrusel_plan/00-README.md`.
   - Todos los nombres de tablas/eventos/rutas son consistentes (vas a referenciarlos en todas las tandas siguientes).

4. **Commit:**
   ```
   docs(carousel): add architecture decision doc
   ```

## Constraints

- NO crear código todavía. Solo el ADR.
- NO modificar nada del carril de videos. Si tenés dudas, leelo y comentá.
- NO inventar columnas/eventos/rutas que no estén justificadas. Cada decisión debe tener "porqué".
- Mantené el ADR en español (Manuel lo va a leer).
- Markdown claro, headings `##` para cada sección. Bajo 1500 líneas.

## Done cuando

- `docs/carrusel_plan/ADR.md` existe.
- Commit hecho.
- `git status` limpio.
