---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: [T1-P02, T2-P01]
file-ownership:
  - apps/web/src/lib/storage/
  - apps/web/src/lib/storage/buckets.ts
  - apps/web/src/lib/storage/upload.ts
  - apps/web/src/lib/storage/signed-urls.ts
  - apps/web/src/lib/storage/index.ts
  - packages/db/migrations/0004_storage_buckets.sql
duracion-estimada: 30 min
---

# T2-P06 — Supabase Storage helpers (audios, videos, raw)

## Contexto

Necesitamos 3 buckets en Supabase Storage:
- `audios` — MP3 generados (intermedio del pipeline). Privado.
- `videos` — MP4 finales listos para descargar. Privado, signed URLs 24h.
- `voice-samples` — muestras de voz que Manuel sube para clonar (T1-P05 manual). Privado.

Lee:
- `prompts/00-ARCHITECTURE.md`

## Tarea

### 1. Migración para crear buckets (`packages/db/migrations/0004_storage_buckets.sql`)

```sql
-- Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('audios', 'audios', false, 50000000, ARRAY['audio/mpeg', 'audio/wav']),
  ('videos', 'videos', false, 200000000, ARRAY['video/mp4']),
  ('voice-samples', 'voice-samples', false, 100000000, ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies
CREATE POLICY "Users can manage own audios"
  ON storage.objects FOR ALL
  USING (bucket_id = 'audios' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can manage own videos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can manage own voice samples"
  ON storage.objects FOR ALL
  USING (bucket_id = 'voice-samples' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Service role bypass (worker)
CREATE POLICY "Service role has full access" ON storage.objects FOR ALL TO service_role USING (true);
```

Convención de paths: `{bucket}/{user_id}/{video_id}/{filename}.

### 2. Helpers (`apps/web/src/lib/storage/`)

`buckets.ts`:
```ts
export const BUCKETS = {
  audios: 'audios',
  videos: 'videos',
  voiceSamples: 'voice-samples',
} as const;
```

`upload.ts` (server-side, usa admin client):
```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { readFile } from 'node:fs/promises';

export async function uploadFile(input: {
  bucket: keyof typeof BUCKETS;
  userId: string;
  videoId?: string;
  filename: string;
  data: Buffer | string;        // Buffer o filepath
  contentType: string;
}): Promise<{ path: string }>;

export async function uploadFromPath(input: {
  bucket: keyof typeof BUCKETS;
  userId: string;
  videoId?: string;
  filePath: string;
  contentType: string;
}): Promise<{ path: string }>;
```

`signed-urls.ts`:
```ts
export async function getSignedUrl(input: {
  bucket: keyof typeof BUCKETS;
  path: string;
  expiresIn?: number;          // default 24*60*60 (24h)
}): Promise<string>;

// Para AssemblyAI que necesita URL pública temporal
export async function makeAssemblyAIAccessibleUrl(
  bucket: keyof typeof BUCKETS,
  path: string
): Promise<string>;
```

### 3. Server actions para frontend

```ts
// apps/web/src/lib/storage/index.ts
export { uploadFile, uploadFromPath } from './upload';
export { getSignedUrl } from './signed-urls';
export { BUCKETS } from './buckets';
```

Todas las funciones exportadas deben funcionar **solo desde server** (route handlers, server actions, worker).

## Reglas

- Path siempre con prefix `{userId}/` para que RLS funcione.
- Si el archivo ya existe, sobreescribir (`upsert: true`).
- Cleanup helper: `deleteOlderThanDays(bucket, days)` para limpiar audios viejos (cron mensual).
- Cero exposición de service_role al cliente.

## Verificación

Test integración:
```ts
const userId = 'test-user-id';
const { path } = await uploadFile({
  bucket: 'audios',
  userId,
  videoId: 'test',
  filename: 'test.mp3',
  data: Buffer.from('fake mp3'),
  contentType: 'audio/mpeg',
});
const url = await getSignedUrl({ bucket: 'audios', path });
console.log(url);   // Debe abrir el archivo en browser
```

## Output esperado

Helpers de storage listos para que el render pipeline (T5) suba audios/videos y devuelva signed URLs al frontend.
