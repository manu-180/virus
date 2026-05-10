# Tanda 2.05 — Wrapper de Gemini para imágenes de carrusel (4:5)

## Contexto

`packages/shared/src/visuals/providers/gemini.ts` ya tiene un client de Gemini funcionando para imágenes (lo usa el pipeline de videos). Vamos a extenderlo (sin romper su uso actual) para soportar el caso carrusel: aspect ratio 4:5 (1080×1350), batch de N imágenes con consistencia visual entre slides, y guardado al bucket nuevo `carousels_bucket`.

Modelo target: **Gemini 2.5 Flash Image** (`gemini-2.5-flash-image-preview` o el ID correcto al momento — verificá con context7 si hace falta).

## Pasos

1. **Leer:**
   - `packages/shared/src/visuals/providers/gemini.ts` completo (entender el client actual, no romperlo).
   - `packages/shared/src/visuals/cache/` (entender caching/dedup actual).
   - `packages/shared/src/carousel/prompts.ts` (función `buildVisualPrompt` ya creada).
   - `packages/shared/src/carousel/types.ts`.
   - `packages/shared/src/carousel/templates.ts` (`STYLE_PRESETS`).
   - El ADR — sección storage paths.

2. **(Opcional pero recomendado) Verificar API actual de Gemini Image Gen** con context7:
   ```
   resolve-library-id "google generative ai"
   query-docs <id> "generate images aspect ratio batch"
   ```
   Confirmá: nombre exacto del modelo de image gen disponible en febrero 2026, parámetro de aspect ratio (string `"4:5"` vs object), formato de respuesta (base64 vs URL).

3. **Crear `packages/shared/src/carousel/image-provider.ts`:**
   - Función `generateCarouselSlideImage(args: { brief: CarouselBrief; slide: SlideSpec; brand: ProjectBrand; userId: string; carouselId: string; supabase: SupabaseClient }): Promise<{ path: string; bytes: number; costCents: number }>`.
   - Internamente:
     1. `prompt = buildVisualPrompt(slide, brief.stylePreset, brand)`.
     2. Llama al client Gemini con `aspectRatio: '4:5'`, `model: 'gemini-2.5-flash-image-preview'` (o el ID correcto al momento), 1 imagen por call.
     3. Recibe el buffer/base64 → lo sube a `carousels_bucket` con path `${userId}/${carouselId}/slide-${slide.idx}.png`.
     4. Devuelve `{ path, bytes, costCents }`.
   - Manejo de errores: si Gemini devuelve safety block → tirar `CarouselSafetyBlockedError` (clase exportada). Si rate limit → tirar `CarouselRateLimitError` (Inngest hará retry exponencial).
   - **Determinismo**: pasá `seed` derivado de `${carouselId}-${slide.idx}` para que regenerar dé output cercano (si la API lo soporta).

4. **Crear `packages/shared/src/carousel/image-batch.ts`:**
   - Función `generateAllSlideImages(args: { brief; slides: SlideSpec[]; brand; userId; carouselId; supabase; onSlideDone?: (idx, result) => Promise<void> })`.
   - Implementa concurrencia limitada (p.ej. `p-limit` con concurrency 3 — agregá `p-limit` a deps de `packages/shared` si no está).
   - Llama a `generateCarouselSlideImage` por cada slide; invoca `onSlideDone` después de cada una para que el worker pueda emitir `virus/carousel.slide.generated` y persistir el path.
   - Si una falla, las otras siguen. Devuelve `{ succeeded: SlideResult[]; failed: { idx, error }[] }`.

5. **Tests** — crear `packages/shared/src/carousel/__tests__/image-provider.test.ts` con vitest:
   - Mock del client Gemini.
   - Test: prompt correcto, aspect 4:5, path correcto.
   - Test: rate limit error se mapea correctamente.
   - Test: batch con 8 slides, 1 falla → succeeded.length=7, failed.length=1.

6. **Verificar:**
   ```powershell
   pnpm --filter @virus/shared test
   pnpm --filter @virus/shared typecheck
   ```

7. **Commit:**
   ```
   feat(shared/carousel): add Gemini image provider for 4:5 carousel slides with batching
   ```

## Constraints

- **NO** modificar la firma pública del client Gemini existente. Solo extender lo nuevo.
- **NO** subir todavía con Inngest — esta tanda es lib pura, sin worker. La Tanda 8 conecta.
- Aspect ratio fijo `"4:5"` v1 (sin parámetro configurable).
- Manejá el caso "Gemini devuelve string base64 con prefijo `data:image/png;base64,`" — strippá el prefijo antes de subir.
- Logueá costo por call (estimado) usando los constants de `packages/shared/src/carousel/cost.ts`.

## Done cuando

- 2 archivos nuevos en `packages/shared/src/carousel/`.
- Tests verdes.
- Typecheck verde.
- Commit hecho.
