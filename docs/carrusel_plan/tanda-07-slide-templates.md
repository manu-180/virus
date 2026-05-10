# Tanda 2.07 — Slide templates: 3 style presets cohesivos

## Contexto

La Tanda 6 dejó un composer parametrizable. Ahora definimos los 3 presets **bien curados visualmente** para que cualquier carrusel se vea profesional sin que Manuel toque nada por slide. Estos son los presets que aparecen en el dropdown del form de creación.

## Pasos

1. **Leer:**
   - `packages/shared/src/carousel/templates.ts` (skeleton ya creado).
   - `packages/shared/src/carousel/composer.ts` (cómo consume `StylePreset`).
   - El brand de APEX en `project_brand` (consultá DB local con `pnpm exec tsx -e "..."` o mirá un seed si hay) para saber paletas que tengan sentido por defecto.

2. **Diseñar 3 presets en `packages/shared/src/carousel/templates.ts`:**

   - **`minimal`** (default):
     - Paleta: blanco crema (#F8F5EE) sobre overlay 60% blanco; texto negro (#0A0A0A); accent #E63946.
     - Fonts: title `Bricolage Grotesque 700`, body `Inter 500`.
     - Title: 72px, line-height 1.05; body: 32px, line-height 1.3.
     - Overlay: gradient blanco bottom→top opacidad 0.7→0.0.
     - Padding: 80px.
     - Layout: title + body abajo, eyebrow chip arriba (slide role).

   - **`bold`**:
     - Paleta: negro (#0A0A0A) overlay 80%; texto amarillo (#FFD60A); accent magenta (#FF006E).
     - Fonts: title `Archivo Black 900`, body `Inter 600`.
     - Title: 88px UPPERCASE, line-height 0.95; body: 30px.
     - Overlay: solid bottom 50%.
     - Padding: 64px.
     - Layout: title centrado vertical, body justo abajo.

   - **`editorial`**:
     - Paleta: beige (#EDE6D6) overlay 50%; texto serif marrón (#3A2E1F); accent rojo oxido (#A23E2C).
     - Fonts: title `Playfair Display 700` (italic en eyebrow), body `Inter 400`.
     - Title: 64px, line-height 1.1; body: 28px.
     - Overlay: gradient beige top→bottom suave.
     - Padding: 96px.
     - Layout: estilo revista, eyebrow + número grande de slide arriba derecha.

3. **Por slide-role — variaciones sutiles:** Cada preset debe tener una micro-variación según el rol del slide (`hook`, `problem`, `insight`, `data`, `example`, `cta`):
   - `hook`: title más grande, sin body o body muy corto.
   - `data`: number BIG centrado (si el body empieza con `\d+%` o `\d+x` extraerlo y agrandar).
   - `cta`: arrow → al lado del title, color accent.
   - Implementá esto en una función `getLayoutForRole(role, preset): LayoutOverrides` y aplicalo en `composer.ts`.

4. **Visual prompts cohesivos** — actualizar `packages/shared/src/carousel/prompts.ts` función `buildVisualPrompt`:
   - Para `minimal`: "soft cream background, subtle texture, high-key lighting, lots of negative space, no text".
   - Para `bold`: "high contrast scene, dramatic lighting, vivid saturated colors, cinematic, no text".
   - Para `editorial`: "magazine editorial photography, muted desaturated tones, film grain, no text".
   - **Coherence trick**: pasar a Gemini el mismo "scene anchor" en todos los slides del carrusel (el `brief.topic` traducido) + variación por slide. Implementalo en `buildVisualPrompt`.

5. **Renderizar samples manuales** — extender `packages/shared/scripts/render-sample.ts` para que genere los 3 presets × 3 slide-roles (`hook`, `data`, `cta`) = 9 PNGs con un baseImage fake (gradiente sólido). Mirálos vos.

6. **Tests** — extender `__tests__/composer.test.ts`:
   - Cada preset produce dimensiones 1080×1350.
   - Layout de role `data` con body `"73% de los sitios..."` extrae el "73%" y lo renderiza grande.
   - Title largo (>60 chars) trunca con "…".

7. **Verificar:**
   ```powershell
   pnpm --filter @virus/shared test
   pnpm --filter @virus/shared exec tsx scripts/render-sample.ts
   ```
   Abrí los 9 PNG. Si alguno se ve feo, ajustá tokens en `templates.ts` y volvé a correr.

8. **Commit:**
   ```
   feat(shared/carousel): finalize 3 style presets (minimal, bold, editorial) with role-aware layouts
   ```

## Constraints

- **NO** crear más de 3 presets v1 (YAGNI).
- **NO** parametrizar fonts/colores desde el form todavía — los presets son curados.
- Cada preset tiene que verse **profesional out of the box**. Si el sample render se ve mal, iterar antes de commitear.

## Done cuando

- 3 presets implementados con role variations.
- Samples renderizados se ven bien (mirar los 9 PNG).
- Tests + typecheck verde.
- Commit hecho.
