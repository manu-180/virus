# Tanda 2.08 — Worker function: `generate-carousel-slides` + `compose-carousel-overlay`

## Contexto

Las Tandas 5-7 dejaron las libs puras: image provider Gemini, composer Satori+Sharp, y los presets. Ahora conectamos en el worker Inngest. Reemplazamos los stubs que dejó la Tanda 4.

Pipeline en este punto:
1. `virus/carousel.created` → orchestrator que consulta el brief, llama Claude para producir el `SlideSpec[]` (slide plan), persiste en DB y emite `virus/carousel.slides.requested`.
2. `virus/carousel.slides.requested` → genera N imágenes base con Gemini (Tanda 5), persiste paths en `carousel_slides`. Por cada una emite `virus/carousel.slide.generated`. Al final emite `virus/carousel.slides.composed.requested` (o equivalente).
3. `virus/carousel.slides.composed.requested` → composer Satori+Sharp por slide, persiste `composed_path`. Al final emite `virus/carousel.caption.requested`.

Caption queda para Tanda 9.

## Pasos

1. **Leer:**
   - `apps/worker/src/functions/generate-script.ts` (patrón de función worker que llama Claude).
   - `apps/worker/src/functions/generate-visual-assets.ts` (patrón con visuals + bucket).
   - `apps/worker/src/functions/orchestrator.ts`.
   - `packages/shared/src/carousel/*` (todo lo de Tandas 3-7).
   - El ADR.

2. **Implementar `apps/worker/src/functions/generate-carousel-plan.ts`** (nuevo, no estaba en stubs — agregalo y registralo):
   - Trigger: `virus/carousel.created`.
   - Steps:
     1. `step.run('load-context')`: lee `carousel_projects` por id (incluye brief jsonb), `project_brand`, `project_patterns`. Si falta brand → fail con `CAROUSEL_NO_BRAND`.
     2. `step.run('plan-slides')`: llama Claude (sonnet) con `buildSlidePlanPrompt(brief, brand)`. Espera JSON `SlideSpec[]`. Validá con Zod (creá schema en `packages/shared/src/carousel/types.ts` si no está). Si Claude devuelve JSON inválido → 1 retry con "fix this JSON".
     3. `step.run('persist-slides')`: insert `carousel_slides` con status='planned' por cada spec.
     4. `step.run('update-status')`: `carousel_projects.status='generating_slides'`.
     5. `step.sendEvent('emit-request', { name: 'virus/carousel.slides.requested', data: { carouselId } })`.

3. **Implementar `apps/worker/src/functions/generate-carousel-slides.ts`** (reemplazar stub):
   - Trigger: `virus/carousel.slides.requested`.
   - Steps:
     1. Carga slides + brief + brand de DB.
     2. Por cada slide: `step.run(\`gen-${idx}\`, async () => generateCarouselSlideImage({ ... }))`. Inngest hace los retries automáticos. Tras éxito, update `carousel_slides[idx]={ image_path, status:'generated' }` y `step.sendEvent` `virus/carousel.slide.generated`.
     3. Si todos OK: `step.run('mark-composing')` actualiza status a `composing` y emite `virus/carousel.slides.composed.requested`.
     4. Si alguno falló después de retries Inngest → emite `virus/carousel.failed` con step y error.

4. **Implementar `apps/worker/src/functions/compose-carousel-overlay.ts`** (reemplazar stub):
   - Trigger: `virus/carousel.slides.composed.requested`.
   - Carga slides con `image_path` no nulo, llama `composeAllSlides`. Persiste `composed_path` por slide.
   - Al final emite `virus/carousel.caption.requested`.

5. **Registrar las 3 funciones** en el array `serve({ functions: [...] })` del worker.

6. **Logs y métricas**:
   - Cada step que llama Gemini debe loguear `costCents` para que después la Tanda 18 los agregue a `usage_records`.
   - Logs en JSON con `{ carouselId, idx, model, ms }`.

7. **Test E2E manual local:**
   ```powershell
   # terminal 1: web
   pnpm dev
   # terminal 2: inngest dev
   npx inngest-cli@latest dev --no-discovery -u http://localhost:3002/api/inngest
   # terminal 3: worker
   pnpm --filter @virus/worker dev
   # terminal 4: insertar manualmente un carousel_projects + dispatch del evento
   ```
   - Insertá un `carousel_projects` row con `brief = { topic: 'errores comunes en sitios web', angle: 'contrarian', tone: 'direct', slideCount: 8, stylePreset: 'minimal', language: 'es', cta: 'DM WEB' }` y `user_id` válido.
   - Disparalo con `inngest.send({ name: 'virus/carousel.created', data: { carouselId, userId } })` (script ad-hoc o desde `psql` con un trigger, lo que prefieras).
   - Verificá en el dashboard de Inngest que las 3 funciones corren a fin.
   - Verificá en `carousels_bucket` que aparezcan `slide-1..8.png` y `composed-1..8.png`.

8. **Commit:**
   ```
   feat(worker): implement carousel plan, slides generation, and overlay composer functions
   ```

## Constraints

- **NO** publicar a IG. Esto solo deja archivos listos en el bucket.
- **NO** hacer caption en esta tanda — Tanda 9.
- Toda llamada externa va dentro de `step.run(...)` o `step.sendEvent(...)` — no hagas side-effects fuera de steps (Inngest no garantiza re-ejecución correcta).
- Si una sola slide falla y las otras OK: marcá ese slide `status='failed'` pero **no** marques el carrusel completo como failed; en Tanda 13 vamos a permitir regenerar slides individuales.
- Concurrencia Gemini: máx 3-4 simultáneas para no rate-limit.

## Done cuando

- 3 funciones reemplazan los stubs.
- E2E manual genera 8 PNG base + 8 PNG compuestos en el bucket.
- Logs muestran cost cents razonables (~16 cents para 8 slides).
- Commit hecho.
