# Tanda 1.04 — Eventos Inngest + client wrapper para carruseles

## Contexto

Hay un package `packages/inngest` que centraliza cliente y definiciones de eventos. La web los despacha con `inngest.send(...)` y el worker los consume con `inngest.createFunction(...)` (en `apps/worker/src/functions/`).

**Crítico (memoria del proyecto):** la web NO sirve funciones Inngest, solo despacha. Solo el worker expone `serve()`. No duplicar handlers.

## Pasos

1. **Leer:**
   - `packages/inngest/src/client.ts`
   - `packages/inngest/src/events.ts` (o donde estén las definiciones — busca `EventSchemas` o similar)
   - Cómo el worker actual registra funciones en `apps/worker/src/index.ts` o `apps/worker/src/server.ts`
   - El ADR (`docs/carrusel_plan/ADR.md`) sección "Eventos Inngest"
   - `apps/web/src/app/api/generate/route.ts` para ver cómo se despachan eventos hoy

2. **Agregar al schema de eventos en `packages/inngest/`** (mismo archivo donde están los `virus/idea.*`, `virus/script.*`, etc.):
   ```ts
   'virus/carousel.created': { data: { carouselId: string; userId: string } };
   'virus/carousel.brief.ready': { data: { carouselId: string } };
   'virus/carousel.slides.requested': { data: { carouselId: string } };
   'virus/carousel.slide.generated': { data: { carouselId: string; idx: number } };
   'virus/carousel.slides.composed': { data: { carouselId: string } };
   'virus/carousel.caption.requested': { data: { carouselId: string } };
   'virus/carousel.completed': { data: { carouselId: string } };
   'virus/carousel.failed': { data: { carouselId: string; step: string; error: string } };
   ```

3. **Crear `packages/inngest/src/carousel.ts`** con helpers tipados:
   - `dispatchCarouselCreated(args: { carouselId: string; userId: string })` que envuelve `inngest.send`.
   - Idem para `dispatchCarouselSlideGenerated`, etc. (sólo los que la web va a usar — los internos del worker se mandan con `step.sendEvent` directo).

4. **Re-exportar del barrel** (`packages/inngest/src/index.ts`).

5. **Crear stubs vacíos en el worker** para que el deploy no falle si alguien manda un evento antes de que la lógica real exista. En `apps/worker/src/functions/`:
   - `generate-carousel-slides.ts` — exporta una función Inngest que solo `step.run('todo', () => 'not implemented')`.
   - `compose-carousel-overlay.ts` — idem.
   - `generate-carousel-caption.ts` — idem.

6. **Registrar los stubs** en el array de funciones que el worker sirve (busca `serve({ functions: [...] })` en `apps/worker/src/`).

7. **Verificar:**
   ```powershell
   pnpm typecheck
   pnpm --filter @virus/web build  # opcional, si es rápido
   ```
   Y manualmente: arrancar dev server (`pnpm dev`) + Inngest dev (`npx inngest-cli@latest dev --no-discovery -u http://localhost:3002/api/inngest`) y comprobar que el dashboard de Inngest lista los nuevos eventos en el schema.

8. **Commit:**
   ```
   feat(inngest): wire carousel events and worker function stubs
   ```

## Constraints

- **NO** poner lógica real en los stubs todavía. Tandas 5-9 los llenan.
- **NO** tocar definiciones de eventos de video.
- **NO** servir funciones Inngest desde la web. Solo el worker.
- Mantené naming consistente con eventos existentes (`virus/<scope>.<verb>`).

## Done cuando

- Schema de eventos extendido y tipado.
- 3 stubs creados y registrados en el worker.
- Typecheck pasa.
- Inngest dev dashboard muestra los nuevos eventos.
- Commit hecho.
