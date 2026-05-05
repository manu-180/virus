---
modelo: opus-4.7-1M
modelo-id: claude-opus-4-7[1m]
agente: backend-architect
tanda: 5
depende-de: [T2-P03, T2-P04, T2-P05, T2-P06, T2-P07, T5-P01]
file-ownership:
  - apps/worker/src/functions/orchestrator.ts
  - apps/worker/src/functions/generate-script.ts
  - apps/worker/src/functions/synthesize-audio.ts
  - apps/worker/src/functions/transcribe-audio.ts
  - apps/worker/src/functions/render-video.ts
  - apps/worker/src/functions/generate-caption.ts
  - apps/worker/src/functions/handle-failure.ts
  - apps/worker/src/utils/
duracion-estimada: 120 min
---

# T5-P02 — Orchestrator del pipeline (idea → video listo)

## Por qué Opus 4.7 1M

Necesitás cargar simultáneamente:
- El framework de viralidad (`packages/shared/src/viral/`).
- Los clientes de Anthropic, ElevenLabs, AssemblyAI, Storage, Remotion Lambda.
- El schema de DB (`packages/db/migrations/`).
- Los stubs de Inngest (T2-P07).
- El schema de Remotion (T3-P01).

Y producir el código que los une. Es la pieza más compleja del sistema. Calidad importa más que precio acá.

## Contexto

Implementás las 6 funciones de Inngest (que T2-P07 dejó como stubs) y las conectás en un flow durable.

Lee:
- `prompts/00-ARCHITECTURE.md` (sección "Pipeline de generación de video").
- Todos los packages de T2 (`@virus/shared/ai`, `audio`, `captions`, `storage`).
- `packages/shared/src/render/` (T5-P01).
- Schema de DB (T1-P02).

## Tarea

### Flow completo

```
[Usuario aprueba idea en /ideas]
    │
    ▼
inngest.send('virus/idea.approved', { videoId, userId })
    │
    ▼
generate-script (Claude Sonnet 4.6 — script writer)
    └─ update DB: videos.script + status='audio'
    └─ inngest.send('virus/script.generated', { videoId })
    │
    ▼
synthesize-audio (ElevenLabs + ffmpeg post-process)
    └─ upload audio a Supabase Storage
    └─ update DB: videos.audio_url + status='captioning'
    └─ inngest.send('virus/audio.synthesized', { videoId, audioPath })
    │
    ▼
transcribe-audio (AssemblyAI)
    └─ update DB: videos.captions + per-segment timings
    └─ inngest.send('virus/captions.ready', { videoId })
    │
    ▼
render-video (Remotion Lambda)
    └─ download MP4 de S3
    └─ upload a Supabase Storage 'videos' bucket
    └─ update DB: videos.video_url, duration_seconds + status='captioning_text'
    └─ inngest.send('virus/render.completed', { videoId, videoUrl })
    │
    ▼
generate-caption (Claude Sonnet 4.6 — caption writer)
    └─ update DB: caption_instagram, caption_tiktok, caption_shorts, hashtags
    └─ status='ready'
    └─ realtime channel notifica al frontend
    │
    ▼
[Usuario ve el video en /pipeline → descargar]
```

### Detalles por step

#### `generate-script.ts`

- Trigger: `virus/idea.approved`
- Steps con `step.run`:
  1. Leer `video_ideas` por id.
  2. Llamar al `script-writer` de T2-P03 con `inputProps`.
  3. Validar output con Zod (timing coherente, segments en orden).
  4. Update `videos` row.
  5. Insertar `job_events` row (auditoría).
- Retry: 2.
- En failure: actualizar status a 'failed', enviar `virus/render.failed`.

#### `synthesize-audio.ts`

- Trigger: `virus/script.generated`
- Steps:
  1. Leer `videos.script`.
  2. Concatenar `voiceovers` con `[pausa 0.3s]` markers.
  3. `generateAudioFromScript` de T2-P04 (con `voice_clone_id` del profile).
  4. Subir MP3 a Storage `audios/{userId}/{videoId}/processed.mp3`.
  5. Generar signed URL para AssemblyAI.
  6. Update DB.
- Retry: 3 (network).
- Cleanup: eliminar archivos temp.

#### `transcribe-audio.ts`

- Trigger: `virus/audio.synthesized`
- Steps:
  1. `generateCaptions` de T2-P05.
  2. Update `videos.captions`.
- Retry: 3.

#### `render-video.ts`

- Trigger: `virus/captions.ready`
- Steps:
  1. Leer todo lo necesario del video row.
  2. Construir `inputProps` que match al schema de Remotion (T3-P01).
  3. `startRender` de T5-P01.
  4. `step.sleepUntil` o polling con `step.waitForEvent`/`step.run` cada 30s hasta `done: true`.
  5. Descargar MP4 local.
  6. Subir a Storage `videos/{userId}/{videoId}/final.mp4`.
  7. Update DB.
- Retry: 1 (caro). En failure: revisar errors y guardarlos en DB.
- Throttle: 5/min (no spam Lambda).

#### `generate-caption.ts`

- Trigger: `virus/render.completed`
- Steps:
  1. Llamar `caption-writer` de T2-P03.
  2. Update DB con captions IG/TikTok/Shorts.
  3. Status final: `ready`.
- Realtime channel emite update.

#### `handle-failure.ts`

- Trigger: `virus/render.failed`
- Action: guardar error en DB, notificar via realtime, enviar email opcional al user.

### Utilidades comunes (`utils/`)

- `getVideoOrFail(videoId, userId)` — leer video con check de ownership.
- `setVideoStatus(videoId, status, fields?)` — update con `updated_at`.
- `logJobEvent(videoId, step, status, payload)`.
- `withRetry(fn, opts)` — wrapper genérico (aunque Inngest ya retry).

### Realtime updates al frontend

Cada step:
- Update `videos` row → Supabase Realtime channel ya emite cambios.
- Frontend (T4-P03) está suscripto al channel y muestra estado en vivo.

## Reglas

- TODOS los steps son **idempotentes**: si Inngest re-trigea por crash, no se duplica trabajo.
- Logs estructurados (`console.log({ step, videoId, ... })`) para que sean parseables.
- Cero "fire and forget": cada acción tiene confirmación o falla explícita.
- Cleanup de archivos temp en `finally`.

## Output esperado

Pipeline funcional end-to-end. Aprobar una idea desde /ideas dispara la cadena completa y un MP4 aparece en /pipeline en ~5-10 minutos.

## Verificación

Test e2e en `apps/worker/test/orchestrator.test.ts`:
1. Insertar idea aprobada.
2. Disparar evento.
3. Esperar 10 minutos.
4. Verificar `videos` row con `status='ready'` y `video_url` válido.
5. Verificar archivo MP4 reproducible.

(Usá Inngest test mode para acelerar tests sin esperar real.)
