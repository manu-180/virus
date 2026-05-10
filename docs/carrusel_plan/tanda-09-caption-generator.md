# Tanda 2.09 — Worker function: `generate-carousel-caption` (3 variantes)

## Contexto

Slides ya generados y compuestos (Tandas 5-8). Ahora generamos **3 captions** con frameworks distintos para que Manuel elija el que prefiera al subir a IG. Frameworks (de la research):
- `hook-pas-cta`: Hook fuerte → Problem → Agitate → Solution (los slides) → CTA.
- `hook-aida`: Hook → Attention → Interest → Desire → Action.
- `contrarian`: Statement contrarian + razón + invitación.

## Pasos

1. **Leer:**
   - `packages/shared/src/carousel/prompts.ts` (`buildCaptionPrompt`).
   - `apps/worker/src/functions/generate-script.ts` (patrón de llamada a Claude).
   - El ADR.

2. **Implementar `apps/worker/src/functions/generate-carousel-caption.ts`** (reemplazar stub):
   - Trigger: `virus/carousel.caption.requested`.
   - Steps:
     1. `step.run('load')`: carrusel + slides (con `headline` y `body`) + brand.
     2. `step.run('gen-variants')`: en paralelo (Promise.all dentro del step) llama Claude 3 veces con `buildCaptionPrompt(..., framework)` para los 3 frameworks. Cada call espera JSON `{ text: string, hashtags: string[] }`.
        - Validá con Zod.
        - Si una falla → seguí con las otras (tener 2 ya es útil).
     3. `step.run('persist')`: insert en `carousel_captions` (3 rows con `variant_idx 0..2`, `selected=false`, `framework`).
     4. `step.run('mark-ready')`: `carousel_projects.status='ready'`.
     5. `step.sendEvent`: `virus/carousel.completed`.

3. **Mejorar el prompt** en `packages/shared/src/carousel/prompts.ts`:
   - Tono Manuel APEX: directo, sin BS, contrarian cuando warranted (extraído del CLAUDE.md global). Pasalo como part del system prompt.
   - Caption length 120-280 caracteres + hashtags al final separados por espacios (5-10 hashtags).
   - Hashtags relevantes a la marca + niche + 1-2 trending genéricos (ej. `#argentina #marketing #emprendedores`).
   - Reglas anti-clickbait, sin emojis exagerados (máx 2).
   - Idioma: español argentino (vos, no tú).
   - **No usar do_not_say** del brand (extraerlos y prohibirlos en el system prompt).

4. **Test unit** en `packages/shared/src/carousel/__tests__/prompts.test.ts`:
   - El prompt para `hook-pas-cta` incluye el problema explícito.
   - Los `do_not_say` aparecen en la sección "EVITAR".
   - Caption no tiene placeholders (`{topic}`, `{cta}`).

5. **Test E2E** (manual): repetir el flujo de Tanda 8 y verificar:
   - Después de composer, automáticamente arranca caption gen.
   - En DB hay 3 rows en `carousel_captions` con texto válido.
   - `carousel_projects.status = 'ready'`.

6. **Commit:**
   ```
   feat(worker): generate 3 caption variants per carousel with PAS / AIDA / contrarian frameworks
   ```

## Constraints

- **NO** elegir caption automáticamente — Manuel elige en UI (Tanda 14).
- **NO** usar emojis decorativos — máx 2 por caption, y solo si aportan.
- Si Claude devuelve >300 chars, truncá pero loggeá warning.
- Si el caption tiene markdown (`**bold**`, listas), strippealo: IG no lo renderiza.

## Done cuando

- Caption function reemplaza stub.
- E2E llega a `status='ready'` con 3 captions.
- Tests verdes.
- Commit hecho.
