# Carruseles de Instagram — Guía de operación

Generador de carruseles IG con IA: Claude (plan + captions) + Gemini Flash (imágenes) + Sharp/Satori (composición).

---

## Cómo crear un carrusel (5 pasos)

1. **Ir a** `/dashboard/carousels/new`
2. **Completar el brief:**
   - **Proyecto** — seleccioná el proyecto; la audiencia y CTA se pre-llenan desde el brand
   - **Tema** — de qué trata el carrusel (ej: "5 errores que matan la conversión")
   - **Ángulo** — Educativo / Contrarian / Historia / Antes-Después / Listicle
   - **Tono** — Directo / Autoritativo / Casual / Contrarian
   - **Slides** — entre 3 y 10 (recomendado: 5-8)
   - **Estilo** — Minimal / Bold / Editorial (visual del carrusel)
3. **Click "Generar carrusel"** → redirect a la pantalla de detalle
4. **Esperar 60–90 seg** hasta que la barra de progreso llegue a "Listo"
5. **Elegir caption** en el picker y **Descargar ZIP**

El ZIP contiene:
- `01-hook.png` … `N-cta.png` — imágenes listas para subir a IG
- `caption.txt` — caption seleccionado con hashtags
- `caption-alt.txt` — variantes alternativas
- `meta.json` — brief y metadatos
- `README.txt` — instrucciones de publicación manual en IG

---

## Costo y limitaciones

| Parámetro | Valor |
|-----------|-------|
| Costo estimado por carrusel | $0.10–$0.40 USD |
| Costo típico (8 slides) | ~$0.36 USD |
| Slides mínimo / máximo | 3 / 10 |
| Idiomas soportados | Español (AR) / Inglés |
| Modelos | Claude Sonnet 4.6 (plan + captions), Gemini 2.5 Flash (imágenes) |
| Tiempo de generación | 60–120 segundos |
| Variantes de caption | 3 (PAS, AIDA, Contrarian) |
| Regeneraciones de captions | máx. 3 por carrusel |

El costo real se registra en `usage_records` y se puede ver en el panel "Detalles de costo" en la página del carrusel.

---

## Troubleshooting

### El carrusel quedó colgado en "Generando slides"

1. **Verificar Inngest dev server** (solo en local): debe correr en `:8288`
   ```
   npx inngest-cli@latest dev --no-discovery -u http://localhost:3002/api/inngest
   ```
2. **Verificar que el worker esté corriendo**: `pnpm --filter @virus/worker dev`
3. **Inngest dashboard** → `http://localhost:8288` → buscar la función `generate-carousel-slides` → ver el error en el run

### El carrusel falló con error

- La pantalla muestra el mensaje de error y un botón "Reintentar"
- El retry es inteligente: retoma desde el último paso exitoso (no reinicia desde cero)
- Pasos del retry: `none → plan → slides → composing → captions`

### Las imágenes no cargan en la galería

- Las imágenes usan signed URLs con TTL de 1 hora → recargar la página
- Verificar que el bucket `carousels` existe en Supabase Storage
- Verificar que el worker tiene `SUPABASE_SERVICE_ROLE_KEY` configurado

### El ZIP está vacío (sin imágenes)

- Significa que los slides no tienen `composed_path` ni `image_path`
- El pipeline falló en el paso de composición o generación de imágenes
- Reintentar el carrusel

### Dónde mirar logs

| Componente | Dónde |
|------------|-------|
| Pipeline Inngest | `http://localhost:8288` → Runs |
| Errores Next.js | Terminal de `pnpm --filter @virus/web dev` |
| Errores worker | Terminal de `pnpm --filter @virus/worker dev` |
| DB en prod | Supabase Dashboard → Logs → API / Postgres |
| Tracking de errores | Sentry (si configurado) |

---

## Operación

### Cambiar el modelo de Gemini (imágenes)

Archivo: `apps/worker/src/functions/generate-carousel-slides.ts`

Buscar la llamada a `generateAllSlideImages` y cambiar el parámetro de modelo. El proveedor está en `packages/shared/src/carousel/image-provider.ts`.

### Cambiar el modelo de Claude (plan + captions)

- **Plan de slides**: `apps/worker/src/functions/generate-carousel-plan.ts`
- **Captions**: `apps/worker/src/functions/generate-carousel-caption.ts`

Buscar la inicialización del cliente Anthropic y cambiar el `model`.

### Agregar un preset visual nuevo

1. Agregar el tipo en `packages/shared/src/carousel/types.ts`:
   ```typescript
   style_preset: 'minimal' | 'bold' | 'editorial' | 'mi-nuevo-preset';
   ```
2. Definir la paleta y layout en `packages/shared/src/carousel/templates.ts` → objeto `STYLE_PRESETS`
3. Agregar la imagen de preview en `apps/web/public/carousel-presets/mi-nuevo-preset.png`
4. Agregar la opción en `NewCarouselForm.tsx` → array `PRESETS`
5. Agregar la opción al enum del schema de validación en `apps/web/src/lib/validators/carousels.ts`
6. Actualizar el `CHECK` constraint en una migration SQL de Supabase

### Dónde están los prompts

| Prompt | Archivo |
|--------|---------|
| Plan de slides (estructura del carrusel) | `packages/shared/src/carousel/prompts.ts` → `buildSlidePlanPrompt` |
| Prompt visual por slide (para Gemini) | `packages/shared/src/carousel/prompts.ts` → `buildVisualPrompt` |
| System prompt de captions | `packages/shared/src/carousel/prompts.ts` → `buildCaptionSystemPrompt` |
| Caption por framework | `packages/shared/src/carousel/prompts.ts` → `buildCaptionPrompt` |

### Estructura de archivos clave

```
apps/
  web/
    src/app/(dashboard)/dashboard/carousels/   ← Páginas UI
    src/app/api/carousels/                     ← API routes
    src/components/carousels/                  ← Componentes React
    e2e/carousel-flow.spec.ts                  ← Tests E2E Playwright
  worker/
    src/functions/generate-carousel-*.ts       ← Pipeline Inngest
    src/functions/compose-carousel-overlay.ts

packages/
  shared/src/carousel/
    prompts.ts        ← Todos los prompts de IA
    composer.ts       ← Composición Satori + Sharp
    templates.ts      ← Presets visuales
    cost.ts           ← Estimación y registro de costos
    state.ts          ← Lógica de retry
    types.ts          ← Tipos compartidos
    __tests__/        ← Tests unitarios + integración
```

---

## Tests

### Correr unit/integration tests

```bash
pnpm --filter @virus/shared test
```

### Correr E2E (requiere servicios corriendo)

```bash
# Arrancar en terminales separadas:
pnpm --filter @virus/web dev                    # :3002
pnpm --filter @virus/worker dev                 # worker
npx inngest-cli@latest dev --no-discovery -u http://localhost:3002/api/inngest  # :8288

# Correr solo el spec de carruseles:
pnpm --filter @virus/web exec playwright test e2e/carousel-flow.spec.ts

# Skip tests que requieren pipeline real (solo verifica API + DB):
SKIP_E2E=1 pnpm --filter @virus/web exec playwright test e2e/carousel-flow.spec.ts
```

---

## Roadmap futuro (parking lot)

Funcionalidades planificadas pero no incluidas en el MVP:

- **Publicación automática a Instagram** — requiere Meta Business Verification + IG Business Account + `instagram_content_publish` permission en la Meta Graph API. Endpoint: `POST /{ig-user-id}/media` + `/{ig-user-id}/media_publish`
- **Scheduling con cron** — publicar a hora óptima (18:00–21:00 AR) automáticamente. Integración con Inngest `step.sleepUntil`
- **A/B test de captions** — publicar la misma imagen con 2 captions distintos y comparar engagement a las 24h via Insights API
- **Video del carrusel para Reels** — exportar las imágenes como video MP4 animado (ken burns effect por slide) usando ffmpeg en worker
- **Carruseles multi-idioma** — mismo brief, generar versiones en ES + EN simultáneamente
- **Métricas post-publish** — listar insights (likes, saves, alcance, impressions) via Meta Insights API en el dashboard
- **Template de carrusel guardable** — guardar un brief como template para reusar (carousel_templates table)
- **Exportación directa a Canva/Figma** — via Canva Connect API o Figma Plugin
