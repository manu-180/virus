# Tanda 5.19 — Retry desde último step + handle-failure adaptado

## Contexto

Inngest hace retries automáticos a nivel step. Pero a nivel orquestación, queremos:
1. Si el carrusel falla en `composing`, retry NO debe regenerar las imágenes base (cuestan plata) — solo recomponer.
2. Si falla en `captions`, retry solo regenera captions.
3. UI: botón "Reintentar" pasa al backend que decide en qué step retomar.
4. Si una slide individual falla pero las otras OK, el carrusel queda en estado intermedio "partial" para que Manuel decida regen-individuals o full retry.

Hay una función existente `apps/worker/src/functions/handle-failure.ts` para el pipeline de videos. La extendemos para carruseles (o creamos paralela `handle-carousel-failure.ts` — preferí paralela para no acoplar).

## Pasos

1. **Leer:**
   - `apps/worker/src/functions/handle-failure.ts` (patrón existente).
   - `apps/web/src/app/api/videos/[id]/retry/route.ts` (patrón retry endpoint).
   - El ADR — sección state machine.

2. **Crear `apps/worker/src/functions/handle-carousel-failure.ts`:**
   - Trigger: `virus/carousel.failed`.
   - Steps:
     1. Carga el carousel + último step OK.
     2. Update `carousel_projects.status='failed'` y guarda el error en `metadata.lastError = { step, message, ts }`.
     3. (Opcional) notifica via observability (Sentry si está integrado, sino solo log).

3. **Actualizar `apps/web/src/app/api/carousels/[id]/retry/route.ts`** (de Tanda 10 — probablemente quedó simple):
   - Lógica:
     ```
     const lastOkStep = inferLastOkStep(carousel) // mira slides + captions presents
     switch (lastOkStep) {
       case 'none': dispatch 'virus/carousel.created';
       case 'plan': dispatch 'virus/carousel.slides.requested';
       case 'slides': dispatch 'virus/carousel.slides.composed.requested';
       case 'composing': dispatch 'virus/carousel.caption.requested';
       case 'captions': // ya está ready, no debería estar failed
     }
     ```
   - Antes de dispatch, resetear status a la fase correspondiente y limpiar `metadata.lastError`.

4. **`inferLastOkStep`** helper en `packages/shared/src/carousel/state.ts`:
   - Pure function que recibe `{ slides, captions, status }` y devuelve `'none' | 'plan' | 'slides' | 'composing' | 'captions'`.
   - Tests unit con varios escenarios.

5. **Per-slide failure UI** (extiende Tanda 13):
   - Si carrusel `status='ready'` PERO algún slide tiene `status='failed'` → mostrar banner "1 de 8 slides falló" con botón "Regenerar slide fallido" individual.

6. **Inngest retry config**:
   - Cada función Inngest debe tener `retries: 3` (o lo que sea default razonable; verificá lo existente). Para Gemini específicamente, retries con backoff exponencial.
   - En `generate-carousel-slides.ts`, usar `step.run` con `step.retries.max = 3` por slide (no por carrusel completo — granular).

7. **Cleanup en delete**:
   - Endpoint DELETE en Tanda 10: además de soft-delete, opcional: eliminar archivos del bucket en background (job `cleanup-deleted-carousels` que corre nightly y borra archivos de `deleted_at < now() - 30 days`). Documentalo, **implementarlo es opcional v1**.

8. **Test manual**:
   - Forzar fallo: temporalmente lanzar un error en `generate-carousel-slides.ts` → ver carrusel con status `failed`.
   - Click "Reintentar" → debe retomar desde el step correcto.
   - Forzar fallo en 1 slide específico → ver banner "1/8 falló" + botón regen → funciona.

9. **Commit:**
   ```
   feat(carousel): smart retry from last successful step + per-slide failure handling
   ```

## Constraints

- **NO** retry infinito — máx 3 retries por step (Inngest default).
- **NO** re-generar imágenes ya OK al hacer full retry — siempre retomar desde el step posterior al último OK.
- Costos: cada retry cuesta plata. Mostrá un warning en UI al hacer full retry: "Esto costará ~$0.20".

## Done cuando

- handle-carousel-failure registrado.
- Retry inteligente desde último step OK.
- Per-slide retry desde UI.
- Tests de `inferLastOkStep` verdes.
- Commit hecho.
