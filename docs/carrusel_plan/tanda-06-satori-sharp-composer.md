# Tanda 2.06 — Composer: Satori (HTML→SVG) + Sharp (overlay) sobre la imagen base

## Contexto

Las imágenes salen de Gemini sin texto (Tanda 5). Acá agregamos el headline + body del slide encima, con tipografía consistente, usando **Satori** (la lib de Vercel que convierte JSX/HTML+CSS a SVG) y **Sharp** para componer el SVG sobre la imagen base.

Por qué este enfoque: AI no es confiable para texto fino → mejor generar el texto en código. Satori da control total sobre tipografía y respeta box model → evita texto desbordado. Sharp es el estándar Node para procesar imágenes y ya lo usás indirectamente en otros lugares.

Output: `composed-{idx}.png` 1080×1350 con headline + body posicionado según el preset.

## Pasos

1. **Leer:**
   - `packages/shared/src/carousel/templates.ts` (STYLE_PRESETS).
   - `packages/shared/src/carousel/types.ts`.
   - `packages/shared/src/carousel/image-provider.ts` (Tanda 5 — para path conventions).
   - El ADR.

2. **Agregar deps en `packages/shared/package.json`:**
   ```json
   "satori": "^0.10.x",
   "sharp": "^0.33.x"
   ```
   (Verificá últimas versiones estables con `pnpm view satori version` / `pnpm view sharp version`).
   - Sharp tiene binarios nativos. Si el monorepo ya lo tiene en otro package, reusá esa versión exactamente.
   - Instalar: `pnpm install`.

3. **Bajar fonts (no commitear binarios pesados — usá CDN o un fetch con caché):**
   - Para v1: Inter (regular + bold) y un display font (ej. Bricolage Grotesque o Archivo Black).
   - Crear `packages/shared/src/carousel/fonts.ts` que descarga las fonts una vez y las cachea en `/tmp/carousel-fonts/` (worker corre en VPS, persistirá entre runs warm). Si falla el fetch, fallback a una font local del sistema (worker Linux: DejaVu Sans).

4. **Crear `packages/shared/src/carousel/composer.ts`:**
   - Función `composeSlide(args: { baseImage: Buffer; slide: SlideSpec; preset: StylePreset; }): Promise<Buffer>`.
   - Pasos internos:
     1. Cargar fonts.
     2. Construir HTML/JSX representando el layout del slide (headline arriba, body debajo, padding del preset, overlay opcional `gradient` o `solid` según preset).
     3. `satori(jsx, { width: 1080, height: 1350, fonts })` → SVG string.
     4. `sharp(Buffer.from(svg)).png().toBuffer()` → SVG renderizado a PNG transparente.
     5. `sharp(baseImage).resize(1080, 1350, { fit: 'cover' }).composite([{ input: svgPng, top: 0, left: 0 }]).png().toBuffer()` → PNG final.
     6. Devolver el buffer.

5. **Crear `packages/shared/src/carousel/composer-batch.ts`:**
   - Función `composeAllSlides(args: { slides: { idx; spec; baseImagePath }[]; preset; userId; carouselId; supabase })`:
     - Por cada slide: bajar baseImage del bucket → `composeSlide` → subir a `carousels_bucket/${userId}/${carouselId}/composed-${idx}.png` → return path.
     - Concurrencia limitada (3-4) con p-limit.
     - Tolera fallos individuales como Tanda 5.

6. **Tests** en `packages/shared/src/carousel/__tests__/composer.test.ts`:
   - Generar un buffer fake (1080×1350 sólido) → componer con headline "Test" → assert que el output es PNG válido y que tiene dimensiones 1080×1350 (con sharp metadata).
   - Test: headline largo (200 chars) no debe romper — debe truncar o wrap.
   - Test: cada preset produce un output distinto en bytes (sanity check).

7. **Sample renders manuales** (no commitear los PNGs — agregá al `.gitignore` un dir `tmp-carousel-samples/`):
   - Script ad-hoc en `packages/shared/scripts/render-sample.ts` que genera 3 slides con un baseImage fake y los guarda en `tmp-carousel-samples/`. Lo corrés vos para ver visualmente que el output queda bien.

8. **Verificar:**
   ```powershell
   pnpm --filter @virus/shared test
   pnpm --filter @virus/shared typecheck
   pnpm --filter @virus/shared exec tsx scripts/render-sample.ts
   # abrir tmp-carousel-samples/ y mirar los 3 PNG
   ```

9. **Commit:**
   ```
   feat(shared/carousel): add Satori+Sharp slide composer with text overlays per style preset
   ```

## Constraints

- **NO** usar Puppeteer/headless Chrome — Satori es 50× más liviano y suficiente.
- **NO** commitear binarios de fonts grandes. Si la font es <500KB y es esencial, OK; si no, cargala on-demand.
- Output siempre 1080×1350 PNG. Calidad: `compressionLevel: 6` en sharp (balance peso/calidad — IG comprime después de todas formas).
- El composer es **sync con respecto al filesystem del worker**: no asumas que el bucket está montado, descargá explícito.

## Done cuando

- `composer.ts`, `composer-batch.ts`, `fonts.ts` creados.
- Sample renders se ven correctos (mirar los PNG).
- Tests verdes, typecheck verde.
- Commit hecho.
