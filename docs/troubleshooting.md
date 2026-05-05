# Troubleshooting

FAQ de problemas comunes. Si el problema no está acá, revisar [docs/runbook.md](runbook.md) para incidentes de infraestructura.

---

## Video y calidad

### "El video se ve mal en mobile, la UI tapa partes importantes"

**Causa:** El contenido importante (texto, cara) está fuera de las safe zones de Instagram/TikTok.

**Safe zones definidas en el sistema:**
- Top: 250px reservados (barra de usuario de Instagram)
- Bottom: 350px reservados (barra de controles de TikTok)
- Zona útil: del px 250 al 730 (en un frame de 1080×1920)

**Fix:**
1. Ir a `/dashboard/settings/brand` → ajustar el layout del template
2. O editar el template directamente: `packages/remotion/src/templates/[template]/index.tsx`
3. Asegurarse de que el texto principal esté dentro de los límites

---

### "La voz suena robótica o con artefactos de audio"

**Causa A:** El voice clone es de baja calidad (audio de muestra con ruido o muy corto).

**Fix:**
1. Grabar nuevo audio de muestra: mínimo 3 minutos, ambiente silencioso, hablar naturalmente
2. Ir a `/dashboard/settings/voice` → re-clonar con el nuevo audio
3. Recomendado: grabar 5 minutos variando el tono y ritmo

**Causa B:** Configuración de ElevenLabs subóptima.

**Fix en ElevenLabs:**
- Stability: 0.45–0.55 (más bajo = más expresivo, más alto = más consistente)
- Similarity: 0.70–0.80
- Style: 0.20–0.30 (para voz natural, no teatral)
- Speaker Boost: activado

**Causa C:** El script tiene símbolos o caracteres que ElevenLabs no pronuncia bien.

**Fix:** Revisar el script en el video afectado. Evitar: emojis en el texto hablado, URLs completas, abreviaciones poco comunes.

---

### "Las captions están desincronizadas con el audio"

**Causa:** El job `transcribe-audio` usó Whisper (fallback) en lugar de AssemblyAI, o AssemblyAI tuvo un error.

**Fix:**
1. En Supabase SQL Editor, verificar el estado del video:

```sql
SELECT id, captions_json, audio_url FROM videos WHERE id = 'VIDEO_ID';
```

2. Si `captions_json` es null o tiene formato incorrecto → re-trigger transcripción:
   - Inngest dashboard → buscar `transcribe-audio` del video → "Replay"

3. Si el problema persiste → verificar `ASSEMBLYAI_API_KEY` en las env vars

---

### "El video tiene el formato correcto pero se ve en baja calidad"

**Causa:** Remotion renderiza en HD (1080×1920) pero la plataforma recomprime al subirlo.

**Esto es normal.** Instagram, TikTok y Shorts comprimen todos los videos al subir.

**Tips para minimizar la pérdida de calidad:**
- Subir desde mobile (la app comprime menos que el browser)
- En TikTok: usar la opción "Save to device" → subir desde galería (no desde la app directamente)
- En Instagram: asegurarse de subir desde WiFi

---

## Engagement y rendimiento

### "El engagement es muy bajo, los videos tienen pocas vistas"

**Primero verificar:** ¿El hook de los primeros 3 segundos es suficientemente fuerte?

El 70% del algoritmo de Reels/TikTok depende de si la gente se queda en el video después de los primeros 3 segundos.

**Checklist de hooks:**
- ¿Genera curiosidad o tensión inmediata?
- ¿Promete algo específico y concreto?
- ¿Está el texto visible de inmediato (no empieza en negro)?
- ¿El primer segmento de audio dura menos de 3 segundos?

**Solución sistemática:**
1. Ir a `/dashboard/lab` (Hook Lab)
2. Crear variantes A/B del hook del video
3. Publicar la variante B como video separado
4. Comparar métricas a las 48h

**Ver las 3 métricas clave** en `proyecto.md §8` para entender qué medir y cómo interpretar.

---

### "Los hashtags no son los correctos para mi nicho"

**Causa:** El archivo `viral_patterns.md` del proyecto tiene hashtags genéricos o viejos.

**Fix:**
1. Ir a `/projects/[id]` → sección "Archivos del proyecto"
2. Actualizar el archivo `viral_patterns.md` con los hashtags actualizados
3. El sistema va a usar los nuevos hashtags en los próximos videos generados
4. Los videos ya generados mantienen sus captions originales (editarlos manualmente si hace falta)

---

## Pipeline y generación

### "El pipeline se atascó y no avanza"

Ver [runbook.md](runbook.md) para el procedimiento completo por tipo de fallo.

**Fix rápido:** Ir a Inngest dashboard → buscar el job atascado → "Replay".

---

### "Claude genera scripts que no suenan como yo"

**Causa:** El archivo `project_info.md` no tiene suficiente contexto sobre tu voz y audiencia.

**Fix:**
1. Ir a `/projects/[id]` → actualizar `project_info.md`
2. Agregar ejemplos de cómo hablás: frases que usás, palabras que evitás, nivel de formalidad
3. Describir a tu audiencia con precisión: quiénes son, qué saben, qué quieren aprender
4. Incluir 2–3 ejemplos de scripts que te gusten del pasado

**Tip:** Cuanto más específico el archivo, más preciso el resultado. Un `project_info.md` de 2 páginas genera mejores scripts que uno de 3 párrafos.

---

### "Se generan ideas que ya hice antes"

**Causa:** La ventana anti-repeat es de 14 días. Si pasaron más de 14 días desde un video similar, el sistema puede volver a sugerirlo.

**Comportamiento esperado.** Las buenas ideas se reciclan, los algoritmos premian la consistencia.

**Si se repite dentro de los 14 días:**
1. Verificar en Supabase que la tabla `project_used_signatures` tiene registros para el proyecto
2. Si está vacía → hay un bug en el anti-repeat. Reportar en Issues.

---

### "No puedo subir el archivo viral_patterns porque es muy grande"

**Límite actual:** 10 MB por archivo.

**Fix:**
- Si es un PDF con imágenes → comprimir con ilovepdf.com o similar
- Si es un documento de texto → convertir a markdown (`.md`) que es mucho más liviano
- Si tenés muchos patrones → separarlos en dos archivos y subir el principal primero

---

## Auth y acceso

### "No puedo hacer login"

**Con Google OAuth:**
1. Verificar que `Site URL` en Supabase → Auth → URL Configuration incluya tu dominio
2. En Google Cloud Console → OAuth → Authorized redirect URIs debe incluir `https://tudominio.com/auth/callback`

**Con Magic Link:**
1. Verificar que Supabase pueda enviar emails (SMTP configurado o usando el relay de Supabase)
2. Revisar spam

---

### "Otro usuario puede ver mis videos"

Esto no debería pasar — RLS está habilitado en todas las tablas. Si ocurre:

1. Verificar en Supabase SQL Editor:

```sql
-- Ver las políticas de RLS en la tabla videos
SELECT * FROM pg_policies WHERE tablename = 'videos';
```

2. Si las políticas no están → correr las migraciones de nuevo: `npx supabase db push`
3. Si las políticas están pero no funcionan → abrí un issue con el SQL de la política afectada

---

## Local dev

### "pnpm dev falla con errores de imports"

```bash
# Reconstruir todo desde cero
pnpm install
pnpm build
pnpm dev
```

### "Inngest no muestra las funciones registradas"

1. Verificar que el worker esté corriendo: `pnpm --filter @virus/worker inngest`
2. En Inngest dashboard (`localhost:8288`) → Apps → debe aparecer "virus" con las funciones
3. Si no aparece → verificar que `INNGEST_EVENT_KEY` esté en `.env.local`
4. Reiniciar ambos procesos

### "TypeScript errors en el editor pero pnpm build funciona"

Probable problema con el cache del language server.

```bash
# Regenerar tipos de Supabase
pnpm --filter @virus/db generate
```

Reiniciar el TypeScript server en VS Code: `Ctrl+Shift+P` → "TypeScript: Restart TS Server".
