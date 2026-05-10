# Tanda 4.15 — Export ZIP: 8 PNGs (composed) + caption.txt + meta.json

## Contexto

El stub de `/api/carousels/[id]/export` quedó devolviendo 501 desde Tanda 10. Acá lo terminamos. El user clickea "Descargar ZIP" en la página detalle (Tanda 12) y baja un .zip listo para subir a IG.

Estructura del ZIP:
```
carousel-{slug}-{date}/
  01-hook.png
  02-problem.png
  ...
  08-cta.png
  caption.txt          (caption seleccionada o variant 0)
  caption-alt.txt      (las otras 2)
  meta.json            (brief, slide roles, generated at)
  README.txt           (instrucciones para subir a IG)
```

## Pasos

1. **Leer:**
   - El stub actual de `/api/carousels/[id]/export/route.ts` (Tanda 10).
   - `archiver` o `jszip` — verificá si ya hay alguno en el monorepo (preferir archiver para streaming en Node).

2. **Agregar dep**: `pnpm --filter @virus/web add archiver @types/archiver`.

3. **Implementar `apps/web/src/app/api/carousels/[id]/export/route.ts`:**
   - GET handler.
   - Auth + RLS check (solo el dueño descarga).
   - Si `status !== 'ready'` → 409 con `{ error: 'NOT_READY' }`.
   - Carga slides + captions + project + brand (solo lo que necesitás).
   - Stream con `archiver`:
     ```ts
     const archive = archiver('zip', { zlib: { level: 6 } });
     archive.pipe(responseStream);
     for (const slide of slides) {
       const { data } = await supabase.storage.from('carousels_bucket').download(slide.composed_path);
       archive.append(Buffer.from(await data.arrayBuffer()), { name: `${pad(slide.idx)}-${slide.role}.png` });
     }
     archive.append(selectedCaption.text + '\n\n' + selectedCaption.hashtags.map(h=>'#'+h).join(' '), { name: 'caption.txt' });
     archive.append(otherCaptions.map(c => `# ${c.framework}\n${c.text}\n${c.hashtags.join(' ')}\n`).join('\n---\n'), { name: 'caption-alt.txt' });
     archive.append(JSON.stringify({ brief, slides: slides.map(s => ({idx: s.idx, role: s.role, headline: s.headline})), generatedAt: project.updated_at }, null, 2), { name: 'meta.json' });
     archive.append(README_TEMPLATE, { name: 'README.txt' });
     archive.finalize();
     ```
   - `Content-Type: application/zip`, `Content-Disposition: attachment; filename="carousel-${slug}-${date}.zip"`.

4. **README_TEMPLATE** (constante en el route file):
   - Texto breve en español: "1) Subí los 8 PNG en orden a IG (botón +, seleccioná múltiples), 2) Pegá el caption.txt, 3) Listo. Aspect ratio ya es 4:5."

5. **Slug**: derivar de `brief.topic` con un slugify simple (existirá `slugify` en el monorepo, sino `topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)`).

6. **Edge cases**:
   - Si algún slide no tiene `composed_path` (regen failed) → usar `image_path` como fallback y agregar warning a meta.json.
   - Si no hay caption `selected` → usar variant_idx=0.

7. **Test manual**:
   - Carrusel ready → click "Descargar ZIP" → bajar `.zip`.
   - Abrir el zip: ver 8 PNGs ordenados, caption.txt con texto + hashtags, meta.json válido, README legible.
   - Subir a IG manualmente como test (opcional, fuera del flow técnico).

8. **Test unit**: 
   - Mock storage download → archive contiene 8 entries con nombres correctos.
   - Status≠ready → 409.

9. **Commit:**
   ```
   feat(web): implement carousel ZIP export with PNGs, captions, meta and IG instructions
   ```

## Constraints

- **NO** comprimir alto — level 6 está fine; los PNG ya son pesados, comprimir más no rinde.
- **NO** cargar todo en memoria si es posible — usar streams con archiver.
- Filename con date `YYYY-MM-DD` para sort manual del user.

## Done cuando

- ZIP descargable con todo dentro.
- Test happy path verde.
- Commit hecho.
