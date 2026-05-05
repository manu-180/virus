# Runbook — Operaciones e Incidentes

Playbook para resolver problemas de producción. Cada sección tiene síntoma → diagnóstico → fix.

---

## Render falla (video queda en estado "rendering")

**Síntoma:** Video no avanza de `rendering` a `captioning_text`. En Inngest dashboard aparece el job con error.

**Diagnóstico:**

1. Ir a Inngest dashboard → buscar el job `render-video` del video afectado
2. Ver el error. Los más comunes:
   - `Function invocation timeout` → Lambda tardó más de 15 min
   - `S3 upload failed` → problema de permisos o bucket incorrecto
   - `Lambda function not found` → la función no está deployada o el nombre en env var es incorrecto

**Fix por tipo de error:**

```bash
# Error de Lambda no encontrada → re-deploy
cd infra/remotion-lambda
node deploy.mjs
# Actualizar REMOTION_LAMBDA_FUNCTION_NAME en .env (Vercel si está en prod)

# Error de S3 → verificar permisos IAM
# El usuario IAM necesita: s3:PutObject, s3:GetObject en el bucket de Remotion
# Ver docs/setup/aws-remotion-lambda.md para la política exacta

# Timeout → el video es muy largo o Lambda tiene poca memoria
# En infra/remotion-lambda/deploy.mjs, aumentar memorySizeInMb (default: 2048)
```

**Re-trigger manual desde el dashboard:**

1. Ir a `/dashboard/pipeline`
2. Encontrar el video con estado `rendering` (atascado)
3. Click en "Reintentar render"
4. O desde Inngest: buscar el job → "Replay"

---

## ElevenLabs quota exceeded

**Síntoma:** Job `synthesize-audio` falla con error 429 o "quota exceeded". Videos quedan en estado `audio`.

**Diagnóstico:**

```
ElevenLabs Creator plan: 100,000 caracteres/mes
1 video ≈ 400–600 caracteres de script
→ Capacidad: ~170–250 videos/mes
```

**Fix:**

1. Verificar uso actual: `elevenlabs.io` → Profile → Usage
2. Si se agotó la quota este mes → esperar reset (primero del mes) o upgradear plan
3. Si no se agotó → el API key puede estar vencido o incorrecto:
   - `elevenlabs.io` → Profile → API Keys
   - Regenerar key si hace falta
   - Actualizar `ELEVENLABS_API_KEY` en Vercel env vars

**Para ver el billing de ElevenLabs:**

```
elevenlabs.io → Profile → Subscription & Usage
```

---

## Anthropic API down o rate limit

**Síntoma:** Jobs `generate-script` o `generate-caption` fallan. Error 529 (overloaded) o 429 (rate limit).

**Comportamiento del sistema:**

Inngest tiene retry automático con backoff exponencial:
- 1er retry: 1 min después
- 2do retry: 5 min después
- 3er retry: 30 min después
- 4to retry: 2 horas después
- Después de 4 fallos → job marcado como `failed`

En la mayoría de los casos, **no hace falta hacer nada** — el sistema se recupera solo.

**Si el job queda `failed` permanentemente:**

1. Verificar el status de Anthropic: `status.anthropic.com`
2. Si hay un incidente activo → esperar a que se resuelva
3. Una vez resuelto → ir a Inngest dashboard → buscar el job → "Replay"

**Si el error es rate limit (429) frecuente:**

```
console.anthropic.com → Settings → Rate Limits
```

Los límites default son suficientes para ~50 videos/día. Si se superan, escribir a Anthropic para aumentar el límite.

---

## Base de datos llena / cleanup de archivos viejos

**Síntoma:** Errores de upload a Supabase Storage. Dashboard de Supabase muestra uso alto.

**Diagnóstico:**

```
Supabase Storage: 1 GB gratis (plan Free), ilimitado en Pro ($25/mes)
Por video: audio ~1 MB + video MP4 ~15–30 MB
→ Con plan Free: ~30–60 videos antes de saturar
```

**Cleanup manual de audios viejos (> 30 días):**

Ejecutar en el SQL Editor de Supabase:

```sql
-- Ver cuánto espacio usan los audios viejos
SELECT 
  count(*) as total_audios,
  count(*) filter (where created_at < now() - interval '30 days') as audios_viejos
FROM videos
WHERE audio_url IS NOT NULL;

-- Obtener las URLs de audios viejos para eliminarlos del storage
SELECT id, audio_url, created_at
FROM videos
WHERE 
  audio_url IS NOT NULL 
  AND created_at < now() - interval '30 days'
  AND status = 'published';
```

Luego en Supabase Storage → `audios` bucket → eliminar los archivos correspondientes.

**Cleanup de videos publicados (> 30 días):**

Los MP4 son los archivos más grandes. Una vez descargados y publicados, se pueden eliminar del storage:

```sql
-- Marcar videos para limpiar (publicados hace más de 30 días)
SELECT id, video_url, published_at
FROM videos
WHERE 
  status = 'published'
  AND published_at < now() - interval '30 days'
  AND video_url IS NOT NULL;
```

**Opción recomendada — Lifecycle rule en S3:**

Para los MP4 en AWS S3 (donde Remotion los renderiza antes de pasarlos a Supabase), configurar lifecycle rule:

```
AWS Console → S3 → tu-bucket-remotion → Management → Lifecycle rules
→ Expire objects after 7 days
```

---

## Lambda quota exceeded (AWS)

**Síntoma:** Renders fallan con error de Lambda invocation limit.

**Diagnóstico:**

```
AWS Lambda free tier: 1M requests/mes, 400,000 GB-segundos/mes
Remotion render: ~2–5 min por video, 2048 MB
→ Free tier: ~65–130 renders/mes
```

**Si se agota el free tier:**

El costo sigue siendo bajo (~$5–10/mes) pero empieza a cobrarse. Verificar en AWS Console → Billing.

**Si hay un límite de concurrencia (muchos renders simultáneos):**

```
AWS Console → Lambda → tu-funcion-remotion → Configuration → Concurrency
```

El límite default de AWS es 1000 concurrent executions por región. Si Remotion falla por throttling:

1. Ir a `AWS Console → Service Quotas → Lambda → Concurrent executions`
2. Clic en "Request quota increase"
3. Llenar el formulario (aprueban en 24–48h)

---

## Video renderizado pero sin audio

**Síntoma:** El MP4 se descarga pero no tiene audio.

**Causa:** El step `synthesize-audio` tuvo éxito pero el `audio_url` no llegó bien al render.

**Fix:**

1. En Supabase SQL Editor:

```sql
SELECT id, audio_url, script_json, status
FROM videos
WHERE id = 'ID_DEL_VIDEO';
```

2. Verificar que `audio_url` no sea null
3. Abrir la URL del audio en el browser — debe reproducirse
4. Si el audio existe pero el video no lo tiene → re-trigger el render:
   - Ir a Inngest dashboard → buscar `render-video` del video → "Replay"

---

## Jobs de Inngest no corren en producción

**Síntoma:** Ideas se aprueban pero el pipeline no arranca. En Inngest dashboard no aparecen jobs nuevos.

**Causa más común:** El webhook de Inngest (`/api/inngest`) no está alcanzable desde Inngest.

**Fix:**

1. Verificar en Inngest dashboard → Apps → Virus → el URL del endpoint
2. Debe apuntar a tu dominio de Vercel: `https://tu-app.vercel.app/api/inngest`
3. Si el URL está mal → Inngest → Apps → Edit → actualizar
4. Verificar que `INNGEST_EVENT_KEY` y `INNGEST_SIGNING_KEY` estén seteadas en Vercel env vars
5. Redeploy de Vercel después de cambiar env vars

---

## Checklist de salud del sistema

Correr cuando algo no funciona y no está claro qué es:

```
□ Supabase Dashboard → status del proyecto (debe ser "Active")
□ Vercel → último deploy fue exitoso
□ Inngest → App "virus" registrada con 6+ funciones
□ ElevenLabs → usage < quota
□ Anthropic → status.anthropic.com (verde)
□ AWS → Lambda function existe en us-east-1
□ .env.local / Vercel env vars → todos los valores seteados y vigentes
```
