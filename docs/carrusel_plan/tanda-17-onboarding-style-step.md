# Tanda 4.17 — Onboarding step opcional: preferencia visual del usuario

## Contexto

El onboarding actual captura brand info y patterns virales. Para que los carruseles salgan más on-brand, agregamos un step opcional donde el user elige su preset visual default y opcionalmente sube una paleta/font (nice-to-have).

## Pasos

1. **Leer:**
   - `apps/web/src/app/onboarding/_steps/` (todos los steps actuales).
   - `apps/web/src/app/onboarding/page.tsx` (orchestración).
   - El schema de `project_brand` (la migration de Tanda 2 NO tocó esto; verificá si tiene un campo `visual_style` jsonb o necesitás agregar uno con una migration nueva).

2. **Migration `packages/db/migrations/0022_brand_visual_style.sql`** (si no existe el campo):
   - `alter table public.project_brand add column visual_style jsonb not null default '{}'::jsonb;`
   - Estructura esperada: `{ defaultPreset: 'minimal' | 'bold' | 'editorial', accentColor?: string, fontPreference?: string, sampleImageUrls?: string[] }`.

3. **Crear `apps/web/src/app/onboarding/_steps/step-visual-style.tsx`**:
   - 3 cards de preset (mismas previews que en el form de creación de carrusel — reusá `/public/carousel-presets/`).
   - Toggle "Personalizar" → campos opcionales:
     - Color picker para `accentColor`.
     - Input para `fontPreference` (free text, sirve solo como hint).
     - Multi-upload "subí 3-5 imágenes que representan tu estilo" (sube a `assets_bucket` con path `${userId}/style-refs/`, guarda URLs en `sampleImageUrls`).
   - Botón "Saltar" (default = 'minimal').
   - Submit: `PATCH /api/onboarding/visual-style` (crear este endpoint en `apps/web/src/app/api/onboarding/visual-style/route.ts`).

4. **Wiring en orchestración**:
   - Agregá el step después del step de brand, antes del de voice.
   - `profiles.onboarding_completed_at` solo se setea cuando todos los steps requeridos pasaron — este nuevo step es **opcional**, no debe bloquear.
   - Si el user ya pasó onboarding → no repetir; agregá un link en `/dashboard/settings` para editarlo más tarde (mini-página en `apps/web/src/app/(dashboard)/dashboard/settings/visual-style/page.tsx` reusando el componente del step).

5. **Consumir las preferencias en el pipeline**:
   - `apps/worker/src/functions/generate-carousel-plan.ts`: si `brief.stylePreset` no está explicitamente seteado en el body del POST, leer `project_brand.visual_style.defaultPreset` y usar ese.
   - Si hay `accentColor`, override del color accent en `templates.ts` por carrusel — pasalo como argumento opcional a `composeSlide`.
   - Si hay `sampleImageUrls`: en el visual prompt agregar "in the style of these references: [urls]" si Gemini soporta image-conditioning (o si no, ignoralo v1 — guarda los datos pero no los usa hasta que sea factible).

6. **Test manual**:
   - Onboarding nuevo user → llegar al step visual-style → elegir 'bold' + color magenta → completar.
   - Crear un carrusel sin elegir preset explícito → debe usar 'bold'.
   - Settings → edit → cambiar a 'minimal' → próximo carrusel sin override usa 'minimal'.

7. **Commit:**
   ```
   feat(onboarding): add optional visual-style step and apply preferences as carousel defaults
   ```

## Constraints

- **NO** romper a users existentes que ya completaron onboarding sin este step. Default a 'minimal' para todos los `visual_style` vacíos.
- Step **opcional** — no bloquea acceso al dashboard.
- `sampleImageUrls` solo guarda v1, no se consume hasta que Gemini soporte image conditioning bien. Documentá esto.

## Done cuando

- Step nuevo visible en onboarding.
- Preferencia se persiste y aplica en próximos carruseles.
- Settings page para editar.
- Commit hecho.
