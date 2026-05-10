# Tanda 3.14 — UI: CaptionPicker con 3 variantes + edit + copy

## Contexto

Otro placeholder de Tanda 12. Component muestra las 3 captions generadas (Tanda 9), permite elegir 1, editarla, copiarla al clipboard, regenerar set completo.

## Pasos

1. **Leer:**
   - `packages/shared/src/carousel/types.ts` (`CaptionVariant`).
   - shadcn Tabs, Textarea, Button, Toast.

2. **Crear `apps/web/src/components/carousels/CaptionPicker.tsx`** (client):
   - Props: `captions: CarouselCaption[]`, `carouselId: string`, `onRegenerate: () => Promise<void>`.
   - Estado vacío (mientras no llegaron): "Generando captions… ~15s" + shimmer.
   - Cuando hay captions:
     - Tabs por framework: "Hook + PAS + CTA" | "Hook + AIDA" | "Contrarian".
     - Cada tab muestra:
       - Textarea editable con el caption (controlled, defaultValue del backend).
       - Pill con framework name.
       - Char counter (con warning si <120 o >300).
       - Hashtags chips abajo (taggables, removibles).
       - Botones: [Copiar al portapapeles] [Marcar como elegido] [Regenerar todas].
     - Indicar visualmente cuál está marcada como `selected`.

3. **Acciones**:
   - **Copiar**: `navigator.clipboard.writeText(text + '\n\n' + hashtags.map(h => '#'+h).join(' '))` → toast "Copiado".
   - **Marcar elegido**: `POST /api/carousels/[id]/captions/[variant]/select` → optimistic update.
   - **Editar caption**: PATCH `/api/carousels/[id]/captions/[variant]` con `{ text, hashtags }`. **Esto requiere agregar ese endpoint** — agregalo en esta tanda (mini-extensión de Tanda 10): valida con Zod, update RLS-protected.
   - **Regenerar**: `POST /api/carousels/[id]/captions/regenerate` (también nuevo endpoint mini — despacha `virus/carousel.caption.requested` de nuevo, el worker borra las 3 anteriores e inserta 3 nuevas).

4. **UX**:
   - Cuando edita, debouncear save 800ms (auto-save) + indicador "Guardado ✓".
   - Si la caption marcada como `selected` se edita, mantener `selected=true`.

5. **Mobile**: tabs scrollables horizontalmente si no entran.

6. **Test manual**:
   - Ver 3 tabs con captions.
   - Editar una → auto-save indicator aparece.
   - Copiar → ver toast + verificar clipboard.
   - Elegir una → otra deja de estar selected.
   - Regenerar → spinner → 3 captions nuevas.

7. **Commit:**
   ```
   feat(web): add CaptionPicker with 3 framework variants, inline edit, copy and regenerate
   ```

## Constraints

- **NO** auto-elegir una caption — Manuel decide.
- **NO** publicar a IG (out of scope v1).
- Limitar regenerar a 3 veces por carrusel para no quemar tokens (chequeo en backend con un counter en `carousel_projects.metadata.captionRegens`).

## Done cuando

- Picker con 3 tabs, editable, copy works, select/regenerate works.
- Auto-save funciona.
- Commit hecho.
