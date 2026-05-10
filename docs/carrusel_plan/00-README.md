# Plan: Sección Carruseles de Instagram

> Generador de carruseles virales para IG usando la info de marca cargada (APEX, BotLode, etc.) y créditos de Google AI. Carril paralelo al de videos — el pipeline de videos queda 100% intacto.

## Estado actual del proyecto (snapshot)

- **Stack:** pnpm 10 + Turbo, Next.js 15 (`apps/web`), Inngest worker (`apps/worker`), Supabase (auth+DB+storage), Remotion Lambda para videos.
- **Ya existe e se reusa:** `packages/shared/src/visuals/providers/gemini.ts`, `projects` + `project_brand` + `project_patterns` (onboarding APEX cargado), shadcn+Tailwind, eventos Inngest, RLS, buckets `assets_bucket`/`videos_bucket`.
- **NO tocar:** funciones del worker existentes (`generate-video-*`, `synthesize-audio`, `render-video`, etc.), endpoints `/api/generate`, `/api/videos/*`, `/api/voice/*`, tabla `videos`, `visual_assets` con `video_assets_used`.

## Decisiones de arquitectura (locked)

| Decisión | Valor | Razón |
|---|---|---|
| Modelo de imagen | Gemini 2.5 Flash Image (batch) | Ya hay client + API key, $0.0195/img batch, 4:5 nativo |
| Aspect ratio | 1080×1350 (4:5) | 23% mejor que 1:1, sweet spot IG 2025-2026 |
| Slides por carrusel | 8 default, 3-10 configurable | 8-10 = sweet spot (engagement 10.15%) |
| Texto sobre imagen | Satori (HTML→SVG) + Sharp composite | AI no es confiable para texto fino; overlay = consistente |
| Caption | 3 variantes con framework Hook→PAS→CTA | Permite elegir el mejor antes de subir |
| Orquestación | Inngest (existente) | No fragmentar stack; el worker ya corre |
| Storage | Bucket nuevo `carousels_bucket` | Aisla del de videos |
| Multi-proyecto | FK a `projects.id` (mismo concepto que videos) | Reusar onboarding y `project_brand` |

## Cómo ejecutar este plan

Cada archivo `tanda-NN-*.md` es **un prompt autocontenido para una sesión nueva de Claude Code (Sonnet)**. Pegás el contenido del archivo como primer mensaje en una sesión limpia y dejás que ejecute.

**Orden estricto:** ejecutar en orden numérico. Cada tanda asume que las anteriores están commiteadas.

**Antes de cada tanda nueva:** `git status` debe estar limpio (todo commiteado). El prompt asume que estás en la rama `main` o una rama de feature `feat/carousel-*`.

**Si una tanda falla:** no avances. Iterá en esa misma sesión hasta verde, después seguís.

## Tandas

### Tanda 1 — Foundation (DB, types, eventos, scaffolding)
- `tanda-01-architecture-decision-doc.md` — Doc de arquitectura interna (referencia para todo el resto)
- `tanda-02-db-migration.md` — Migration SQL: tablas `carousel_projects`, `carousel_slides`, bucket
- `tanda-03-shared-module-skeleton.md` — `packages/shared/src/carousel/` con types y eventos
- `tanda-04-inngest-events-wiring.md` — Eventos `virus/carousel.*` registrados en `packages/inngest`

### Tanda 2 — Generation engine (image + text composition)
- `tanda-05-gemini-image-wrapper.md` — Función `generateCarouselImage()` sobre el client Gemini existente
- `tanda-06-satori-sharp-composer.md` — Overlay de texto con Satori + Sharp
- `tanda-07-slide-templates.md` — Templates de estilo (Minimal, Bold, Editorial) con tokens
- `tanda-08-worker-generate-slides.md` — Función Inngest `generate-carousel-slides`
- `tanda-09-caption-generator.md` — Función Inngest `generate-carousel-caption` (3 variantes)

### Tanda 3 — Web UI
- `tanda-10-api-routes.md` — `/api/carousels` POST/GET + retry
- `tanda-11-create-page.md` — Form: topic, angle, slides, style preset, project picker
- `tanda-12-detail-page.md` — Página detalle con realtime de Supabase (status pipeline)
- `tanda-13-slide-gallery.md` — Preview gallery + regenerar slide individual
- `tanda-14-caption-picker.md` — UI para elegir/editar 1 de 3 captions

### Tanda 4 — Export & integration
- `tanda-15-zip-export.md` — Endpoint que devuelve ZIP con PNGs + caption.txt
- `tanda-16-dashboard-listing.md` — `/dashboard/carousels` (lista) + nav link
- `tanda-17-onboarding-style-step.md` — Step opcional en onboarding para preferencia visual

### Tanda 5 — Resilience
- `tanda-18-cost-tracking.md` — Registrar costos en `usage_records` (tabla existente)
- `tanda-19-retry-and-failure-handling.md` — Retry desde último step + `handle-failure` adapt
- `tanda-20-e2e-smoke-test.md` — Test E2E que genera un carrusel y baja el ZIP

---

**Total estimado:** ~12-18 horas de trabajo agregado, ~$2-5 USD/carrusel en costos AI cuando esté listo.

**Out of scope explícito:** publicación automática a IG (Meta API requiere business account verificado y aprobación), scheduling, métricas post-publish. Por ahora la herramienta termina cuando descargás el ZIP.
