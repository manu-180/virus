# Tanda 1.03 — Shared module skeleton: types, prompts, cost helpers

## Contexto

Monorepo en `C:\MisProyectos\Armagedon\virus`. Hay un package compartido `packages/shared` con submódulos `audio`, `visuals`, `viral`, `tokens`, `captions`, `render`. Vamos a agregar `packages/shared/src/carousel/` con types y helpers que consumen tanto la web como el worker.

## Pasos

1. **Leer:**
   - `docs/carrusel_plan/ADR.md`
   - `packages/shared/src/visuals/index.ts` y `packages/shared/src/visuals/types.ts` (patrón de barrel + types).
   - `packages/shared/package.json` (entender exports).
   - `packages/shared/src/db/database.types.ts` (las types regeneradas de la migration anterior).

2. **Crear `packages/shared/src/carousel/types.ts`:**
   - Re-exportar tipos de DB: `CarouselProject = Database['public']['Tables']['carousel_projects']['Row']`, `CarouselSlide`, `CarouselCaption`.
   - Tipo `CarouselBrief`:
     ```ts
     export type CarouselBrief = {
       topic: string;          // "5 errores que evitan que tu sitio venda"
       angle: string;          // "contrarian" | "educational" | "story-arc" | "before-after" | "listicle"
       tone: 'direct' | 'authoritative' | 'casual' | 'contrarian';
       audience: string;       // copiado de project_brand pero overridable
       slideCount: number;     // 3..10
       stylePreset: 'minimal' | 'bold' | 'editorial';
       language: 'es' | 'en';
       cta: string;            // "DM 'WEB' para auditoría gratis"
     };
     ```
   - Tipo `SlideSpec`: `{ idx: number; role: 'hook' | 'problem' | 'insight' | 'data' | 'example' | 'cta'; headline: string; body?: string; visualPrompt: string; }`.
   - Tipo `CaptionVariant`: `{ idx: number; framework: 'hook-pas-cta' | 'hook-aida' | 'contrarian'; text: string; hashtags: string[]; }`.
   - Status enum: `export const CAROUSEL_STATUSES = ['pending','generating_slides','composing','generating_captions','ready','failed','published_manually'] as const;` y type derivado.

3. **Crear `packages/shared/src/carousel/prompts.ts`:**
   - Función `buildSlidePlanPrompt(brief: CarouselBrief, brand: ProjectBrand): string` — el prompt para Claude que devuelve un array de `SlideSpec` en JSON. Incluí en el system prompt: framework hook→problema→insights→data→ejemplo→CTA, longitud headline ≤ 60 chars, body ≤ 140 chars, visualPrompt en inglés (Gemini lo prefiere), reglas anti-clickbait del CLAUDE.md global ("No clickbait: Always deliver"), do-not-say de la marca.
   - Función `buildCaptionPrompt(brief: CarouselBrief, slides: SlideSpec[], brand: ProjectBrand, framework: CaptionVariant['framework']): string` — devuelve un caption en español argentino directo, 120-300 chars, hook + valor + CTA, 5-10 hashtags al final.
   - Función `buildVisualPrompt(slideSpec: SlideSpec, stylePreset: CarouselBrief['stylePreset'], brand: ProjectBrand): string` — devuelve el prompt final para Gemini Imagen. Estilo cohesivo entre slides (paleta, mood). Negative: "no text, no letters, no logos, no people's faces close-up unless requested" (el texto va overlay).

4. **Crear `packages/shared/src/carousel/cost.ts`:**
   - Constantes de pricing (Gemini 2.5 Flash Image batch = $0.0195/img, normal = $0.039; Claude Sonnet ~$3/Mtok in, $15/Mtok out — leelo de un constant ya existente si está).
   - Función `estimateCarouselCost(slideCount: number, captionVariants = 3): { images: number; text: number; total: number }`.

5. **Crear `packages/shared/src/carousel/templates.ts`:**
   - Const `STYLE_PRESETS: Record<'minimal'|'bold'|'editorial', StylePreset>` con `{ palette: string[]; fontFamily: string; titleSize: number; bodySize: number; backgroundOverlay: 'none'|'gradient'|'solid'; padding: number; }`.
   - Estos tokens los va a consumir el composer en la Tanda 2.

6. **Crear `packages/shared/src/carousel/index.ts`** que re-exporta todo lo anterior. Este es el barrel público.

7. **Actualizar `packages/shared/src/index.ts`** para añadir `export * from './carousel';` (verificá si el patrón es ese o si se exporta sub-path con `exports` field en `package.json` — seguí el patrón existente).

8. **Verificar:**
   ```powershell
   pnpm --filter @virus/shared typecheck
   ```
   Debe pasar sin errores.

9. **Commit:**
   ```
   feat(shared): add carousel module skeleton with types, prompts, cost helpers
   ```

## Constraints

- **No** lógica de generación todavía (sin llamadas a Gemini, sin Sharp). Solo types + builders de prompts puros.
- **No** dependencias nuevas en `packages/shared/package.json`.
- TS strict — sin `any`, sin `as unknown as`. Si necesitás un type discriminado, declaralo bien.
- Los prompts tienen que estar en español argentino para captions y en inglés para visual prompts (Gemini funciona mejor en EN para imágenes).

## Done cuando

- `packages/shared/src/carousel/` con 5 archivos creados.
- Typecheck pasa.
- Commit hecho.
- `git status` limpio.
