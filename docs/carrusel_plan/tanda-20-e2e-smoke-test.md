# Tanda 5.20 — E2E smoke test + handoff doc

## Contexto

Cierre del proyecto. Una test E2E que cubre el happy path completo + un doc de operación para Manuel.

## Pasos

1. **Leer:**
   - Frameworks de testing en el monorepo: `vitest` para unit, `playwright` para E2E (verificá si está instalado en `apps/web`).
   - `apps/web/playwright.config.ts` si existe.

2. **Si no hay Playwright** instalado en `apps/web`:
   ```powershell
   pnpm --filter @virus/web add -D @playwright/test
   pnpm --filter @virus/web exec playwright install chromium
   ```
   - Crear `apps/web/playwright.config.ts` con base URL `http://localhost:3002`, project chromium, headless en CI.

3. **Crear `apps/web/e2e/carousel-flow.spec.ts`:**
   - Setup: login con magic link mockeado o crear sesión directa con `supabase.auth.admin.createUser` + cookies. Mirá si hay un helper existente de auth en tests.
   - Test "Genera un carrusel completo end-to-end":
     1. Navegar a `/dashboard/carousels/new`.
     2. Completar form: project, topic="Test E2E carousel", angle=educational, slideCount=3 (rápido), preset=minimal.
     3. Click "Crear" → esperar redirect a `/dashboard/carousels/[id]`.
     4. Esperar (timeout 180s) hasta que el status badge sea "Ready".
     5. Verificar que hay 3 slides visibles en gallery.
     6. Verificar que hay 3 captions en picker.
     7. Click "Descargar ZIP" → verificar que la descarga inicia (Playwright `page.on('download')`).
     8. Verificar tamaño del ZIP > 100KB.

4. **Mock o real?** En CI: real (con API keys de staging Gemini, slideCount=3 para minimizar costo, ~$0.06 por test). En local: opcional skipear con `SKIP_E2E=1`.

5. **Smoke unit/integration test** en `packages/shared/src/carousel/__tests__/integration.test.ts`:
   - End-to-end de las funciones puras: brief → planSlides (mock Claude) → buildVisualPrompt → buildCaptionPrompt → composeSlide (mock Gemini, real Sharp) → output buffer válido.
   - No toca DB, no toca network.

6. **Crear `docs/carousel.md`** (handoff):
   - Sección "Cómo crear un carrusel" para Manuel: 5 pasos UI.
   - Sección "Costo y limitaciones": $0.20-0.30 por carrusel, máx 10 slides, español/inglés solo.
   - Sección "Troubleshooting": qué hacer si falla, dónde mirar logs (Inngest dashboard, Sentry, Supabase logs).
   - Sección "Operación": cómo cambiar el modelo de Gemini, cómo agregar un preset nuevo, dónde están los prompts.
   - Sección "Roadmap futuro" (parking lot): publicación auto a IG vía Meta API, scheduling, A/B test de captions, video del carrusel para Reels, carruseles multi-idioma.

7. **CI integration** (si hay GitHub Actions): agregá un workflow `.github/workflows/e2e-carousel.yml` que corre el smoke test en PRs que tocan `apps/web/src/app/(dashboard)/dashboard/carousels/**` o `packages/shared/src/carousel/**` o `apps/worker/src/functions/*carousel*`.
   - Si no hay CI configurado para el monorepo, dejá el workflow comentado en el doc con un TODO.

8. **Verificar:**
   ```powershell
   # smoke unit
   pnpm --filter @virus/shared test
   # E2E (con servicios corriendo)
   pnpm --filter @virus/web exec playwright test
   ```

9. **Commit:**
   ```
   test(carousel): add E2E playwright smoke test + integration tests
   docs(carousel): add operations and usage handoff
   ```

## Constraints

- **NO** depender de un proyecto/user específico de la DB de prod en el E2E — usar fixtures y un user de test (creado en setup, eliminado en teardown).
- **NO** dejar API keys hardcodeadas. Usar `.env.test` y secrets de GitHub.
- Smoke test corre en <3min. Si tarda más, reducí slideCount=3 y bajá las expectativas de tiempo.

## Done cuando

- Playwright corre el flujo completo a verde.
- Doc `docs/carousel.md` cubre uso + ops + roadmap.
- Commits hechos.
- `git status` limpio.

---

## ⭐ Cierre del plan

A esta altura tenés:
- Sección de carruseles 100% funcional (end-to-end, generar → preview → editar → exportar ZIP).
- Sin tocar el carril de videos (que sigue intacto para retomar cuando quieras).
- Costo ~$0.20 por carrusel.
- Tests E2E + integración + unit.
- Docs operativos.

Próximos pasos opcionales (no incluidos en este plan):
- Publicación automática a Instagram (requiere Meta Business + IG Business account verificado).
- Scheduling con cron.
- Métricas post-publish (likes, saves, alcance) tirando de Insights API.
