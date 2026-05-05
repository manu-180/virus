# Cinematic AI Visual Assets Pipeline — Design

**Date:** 2026-05-05
**Status:** Draft (pending review)
**Owner:** Manuel
**Topic slug:** `cinematic-ai-assets-pipeline`

---

## Problem

Los videos generados por Virus se ven amateur. Los templates de Remotion (`tip`, `hot-take`, `comparison`, `listicle`, `speed-build`, `story-bug`) renderizan **fondo negro plano + caja de texto + bloque de código + captions**. No hay imagery, no hay b-roll, no hay movimiento de cámara. Los segmentos sin código (hook, reveal, CTA) son literalmente "texto blanco sobre negro" — visualmente vacíos. Esto bloquea cualquier objetivo de viralidad y pone un techo bajo a la calidad percibida del producto.

El motor de hooks/topics/formats (`@virus/shared/viral`) ya es sólido: el problema es 100% en la **capa visual de salida**, no en la elección de contenido.

## Goal

Subir el techo visual de cada video generado a "cinematic dev noir" — calidad cinematográfica con estética dev/tech — agregando b-roll generado por IA (Luma Ray) y hero images (Gemini 2.5 Flash Image / "Nano Banana") detrás de los segmentos `hook`, `reveal` y `cta`. Mantener el resto del pipeline intacto.

### Non-goals

- No reemplazar Remotion. Los assets generados se componen DENTRO de los templates existentes.
- No tocar los templates `comparison`, `listicle`, `speed-build`, `story-bug`, `hello` en esta iteración. Solo `tip` y `hot-take` (los más usados). Los otros 5 se actualizan en una iteración posterior si esto funciona.
- No generar voiceover ni música con IA — eso ya está cubierto por ElevenLabs.
- No tocar el motor viral, anti-repetición, ni el sistema de scripts.
- No agregar nuevos templates.

## Constraints & decisions

1. **Solo 3 slots con b-roll por video** (decidido por el usuario, opción A): `hook`, `reveal`, `cta`. Los segmentos `setup`, `development`, `mini_payoff` siguen renderizando con fondo negro / código como hoy.
2. **Estilo visual fijo: "Cinematic Dev Noir"** (decidido por mí). Prompts base con descriptores fijos:
   - Cámara: shallow DoF, slow dolly/push, anamorphic feel
   - Luz: dim ambient + light shafts con polvo/partículas
   - Color: acento neón en `themeColor` del proyecto (default `#3ECF8E` Supabase green)
   - Sujetos: terminal con código, mecánicos RGB en penumbra, monitores múltiples, manos tipeando, hardware close-up
   - Negative prompt explícito contra: matrix code rain, glitch fake-hacker, wide shots vacíos, "person at desk" amplios (suelen producir manos deformes en AI)
3. **Sistema de reuso híbrido** (decidido por el usuario): default = generar fresh, pero por slot el usuario puede elegir "reusar de biblioteca" o "elegir manual" desde el dashboard.
4. **Fallback obligatorio**: si Luma o Gemini fallan / timeoutean (>90s) o si la cuota está agotada, el render procede con fondo negro (estado actual). Nunca un fallo de asset bloquea un video.
5. **Cache por hash de prompt**: si el mismo prompt ya generó un asset en este proyecto, reusamos el `storage_url` en vez de regenerar.
6. **MCPs solo en dev**: yo (Claude Code) uso los MCPs de Luma/FAL para iterar prompts. La pipeline de producción (Inngest worker) usa los SDKs oficiales directamente.
7. **Costo target por video con todo fresh: ≤$1.50.** Estimado real: ~$1.15.

## Architecture

### Pipeline events (cambio mínimo)

```
ANTES:
  idea.approved → script.generated → audio.synthesized → captions.ready → render-video

DESPUÉS:
  idea.approved → script.generated → assets.generated ← NUEVO
                                            ↓
                                  audio.synthesized → captions.ready → render-video
```

`audio.synthesized` se dispara DESPUÉS de `assets.generated`. Audio y assets corren secuencialmente porque assets depende del script (necesita los prompts visuales) y audio también — y podemos serializar sin afectar latencia total porque la generación de audio (~60-90s) corre en paralelo a NADA hoy y la nueva generación de assets (~30-60s con concurrencia interna) es comparable. Total pipeline pasa de ~3-6 min a ~4-7 min.

**Alternativa rechazada:** correr assets y audio en paralelo. La gana ~30-60s pero complica el orchestrator y los retries (un fallo de uno tendría que esperar al otro). YAGNI por ahora — si la latencia molesta, se paraleliza después con un `Promise.all` step.

### Componentes nuevos

#### 1. Tabla `visual_assets` (migración `0014_visual_assets.sql`)

```sql
CREATE TABLE public.visual_assets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('video', 'image')),
  category     text        NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  provider     text        NOT NULL CHECK (provider IN ('luma', 'gemini', 'fal')),
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'ready', 'failed')),
  prompt       text        NOT NULL,
  prompt_hash  text        NOT NULL,           -- sha256(prompt + theme_color + provider + template + language)
  template     text        NOT NULL,           -- 'tip' | 'hot-take' | ...
  language     text        NOT NULL,
  storage_path text,                           -- NULL hasta status=ready. bucket: visual-assets, path: <user>/<project>/<id>.<ext>
  duration_sec numeric,                        -- NULL para imágenes
  width        int,
  height       int,
  theme_color  text        NOT NULL,
  tags         text[]      NOT NULL DEFAULT '{}',
  burned       boolean     NOT NULL DEFAULT false,
  last_used_at timestamptz,
  error        text,                           -- mensaje si status=failed
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, prompt_hash)
);

CREATE INDEX visual_assets_project_category_idx
  ON public.visual_assets (project_id, category, burned, status)
  WHERE burned = false AND status = 'ready';

CREATE INDEX visual_assets_last_used_idx
  ON public.visual_assets (project_id, last_used_at DESC NULLS FIRST);
```

**Decisión: NO almacenamos `storage_url`** (signed URLs expiran). Solo `storage_path`. La URL firmada se genera **on-demand**:
- En `render-video.ts`, antes de armar `RenderInputProps`, se firma URL a 1h (suficiente para el render).
- En el dashboard `/dashboard/assets`, las thumbnails firman URLs a 7d (refresh automático en cada page load).

**Decisión: `use_count` NO se almacena**. Se computa con `SELECT COUNT(*) FROM video_assets_used WHERE asset_id = X` cuando se necesita (lectura) o vía vista materializada si performance lo requiere (V2). Esto elimina la race condition de los triggers UPDATE concurrentes.

`burned` se mantiene como columna escribible: cuando un usuario manualmente borra un asset desde el dashboard, se setea `burned=true`. Y un cron job nocturno (V2) lo setea automáticamente cuando el COUNT supera 5.

Trigger `copy_user_id_visual_assets` (mismo patrón que tablas existentes — copia `user_id` desde `projects`).

RLS policies (siguiendo patrón de `0002_rls.sql`): SELECT/INSERT/UPDATE/DELETE solo si `user_id = auth.uid()`.

#### 2. Tabla `video_assets_used` (link table, denormalizada)

Asocia cada video con los assets que usa. `user_id` denormalizado siguiendo el patrón de la casa.

```sql
CREATE TABLE public.video_assets_used (
  video_id  uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_id  uuid NOT NULL REFERENCES public.visual_assets(id) ON DELETE RESTRICT,
  category  text NOT NULL CHECK (category IN ('hook', 'reveal', 'cta')),
  used_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, category)
);

CREATE INDEX video_assets_used_asset_idx ON public.video_assets_used (asset_id);
```

Trigger `copy_user_id_video_assets_used` (copia `user_id` desde `videos.user_id` via `video_id`).

Trigger en INSERT: setea `visual_assets.last_used_at = NOW()` solamente. **NO incrementa contador** (eliminado). Esto es safe a races porque es un UPDATE sin lectura previa (`SET last_used_at = NOW()` es un SET absoluto, no `=last_used_at + ...`).

RLS: SELECT/INSERT/UPDATE/DELETE solo si `user_id = auth.uid()`.

**Idempotencia**: todos los INSERTs en `video_assets_used` usan `ON CONFLICT (video_id, category) DO NOTHING` para tolerar retries de Inngest sin error.

#### 3. Bucket de Storage `visual-assets`

Migración `0015_visual_assets_bucket.sql`. Privado, signed URLs **on-demand** (1h para render, 7d para dashboard previews). Path: `<user_id>/<project_id>/<asset_id>.<mp4|png>`.

#### 3b. Tabla `provider_spend_log` (control de costos)

Migración `0016_provider_spend_log.sql`. Tracking de gasto por provider para circuit breaker.

```sql
CREATE TABLE public.provider_spend_log (
  id           bigserial   PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider     text        NOT NULL CHECK (provider IN ('luma', 'gemini', 'fal')),
  cost_usd     numeric(8,4) NOT NULL,
  asset_id     uuid        REFERENCES public.visual_assets(id) ON DELETE SET NULL,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX provider_spend_log_user_created_idx
  ON public.provider_spend_log (user_id, created_at DESC);

CREATE INDEX provider_spend_log_global_created_idx
  ON public.provider_spend_log (created_at DESC);
```

**Circuit breaker** (en `generate-visual-assets.ts`, step `check-spend-cap`):
- Caps configurables por env var: `ASSETS_MAX_USD_PER_USER_DAILY` (default 20), `ASSETS_MAX_USD_GLOBAL_DAILY` (default 200).
- Si user gastó >cap_user en últimas 24h OR account global gastó >cap_global → todos los slots se setean a NULL (fallback negro), se loguea `job_event` con `step='spend_cap_reached'`, y se manda alert.
- El cap es soft (no rompe el video, lo degrada). Hard kill switch sigue siendo `ASSETS_ENABLED=false`.

RLS: SELECT solo si `user_id = auth.uid()`. INSERT solo desde el service role (worker).

#### 4. Package `@virus/shared/visuals`

Nuevo módulo en `packages/shared/src/visuals/`. Exporta:

- `types.ts` — `VisualAsset`, `AssetCategory`, `GeneratedAssetInput`, `AssetGenerationResult`
- `prompts/build.ts` — toma `script.segments` + `themeColor` + `brand` y devuelve 3 prompts visuales (uno por slot). Usa Claude (vía `@virus/shared/ai`) con un system prompt fijo que codifica el estilo "Cinematic Dev Noir"
- `providers/luma.ts` — wrapper SDK Luma. `generateVideo(prompt, themeColor, durationSec): Promise<{ url, duration }>`. Usa Luma Ray 2 a 720p (precio justifica calidad).
- `providers/gemini.ts` — wrapper Google GenAI SDK. `generateImage(prompt, themeColor): Promise<{ url, width, height }>`. Modelo `imagen-4` o `gemini-2.5-flash-image`.
- `providers/fal.ts` — wrapper opcional FAL como fallback más barato (Flux schnell para imágenes). No se activa por default.
- `cache/lookup.ts` — `findCachedAsset(projectId, promptHash): Promise<VisualAsset | null>`
- `index.ts` — re-exports

#### 5. Inngest function `generate-visual-assets`

Archivo: `apps/worker/src/functions/generate-visual-assets.ts`.

```
Trigger: virus/script.generated
Payload: { videoId: string }

Flow (cada paso numerado es un step.run() separado para que Inngest memoize y NO se duplique en retries):

 1. step.run("load-context"): load video + script + project (themeColor, language) + brand
 2. step.run("check-spend-cap"): query provider_spend_log (24h aggregate). If user spent >$20 OR
    account >$200 in last 24h → set all 3 assets to NULL, send virus/assets.generated, return.
 3. step.run("build-prompts"): build 3 prompts via @virus/shared/visuals.buildPrompts() and
    compute prompt_hash for each (sha256 incluye prompt + theme_color + provider + template + language).
 4. For each slot in [hook, reveal, cta] (3 step.run() calls in parallel via Promise.all over Inngest steps):

    a. step.run("resolve-slot-<slot>"): determine source (manual_id / reuse / fresh) from
       video_ideas.metadata.asset_choices (Zod-validated). If 'reuse', query for non-burned
       status=ready asset matching (category, theme_color, last_used_at < NOW() - 14d). If none, fall
       back to 'fresh'. Returns { mode: 'manual'|'cached'|'generate', assetId?: string, prompt?: string }.

    b. If mode = 'generate':
       - step.run("claim-row-<slot>"): INSERT INTO visual_assets (..., status='pending')
         ON CONFLICT (project_id, prompt_hash) DO UPDATE SET status=visual_assets.status RETURNING id, status.
         If returned status='ready' → use this row, skip generate (concurrent gen). If 'pending' but row was
         claimed >5min ago → reclaim. If 'pending' fresh → we own it.
       - step.run("call-provider-<slot>"): call Luma/Gemini SDK. 90s timeout per call. NON-RETRIABLE on
         provider 4xx (bad prompt). 1 retry on provider 5xx/timeout.
       - step.run("upload-storage-<slot>"): upload bytes to Supabase Storage at <user>/<project>/<asset_id>.<ext>
         with upsert:true.
       - step.run("finalize-row-<slot>"): UPDATE visual_assets SET status='ready', storage_path=..., width=..., height=..., duration_sec=... WHERE id=<assetId>.
       - step.run("log-spend-<slot>"): INSERT INTO provider_spend_log (user_id, provider, cost_usd, asset_id, created_at).

    c. step.run("link-<slot>"): INSERT INTO video_assets_used (video_id, asset_id, category)
       VALUES (...) ON CONFLICT (video_id, category) DO NOTHING.

 5. step.run("update-video-metadata"): UPDATE videos SET metadata = jsonb_set(metadata, '{assets}', ...).
    Asset id is NULL for any slot whose generation failed (fallback path).
 6. step.run("log-event"): INSERT job_events row.
 7. step.sendEvent: virus/assets.generated { videoId, assetIds: { hook, reveal, cta } }
    AND if any slot is NULL: virus/assets.failed { videoId, slot, reason } for each failed slot.

Concurrency: 3 (allows full parallelism; Luma's per-key serialization is enforced by the provider).
Retries: 1 (Inngest level — but each step.run handles its own retry policy internally).
Timeout per provider call: 90s.
On any unhandled error: onFailure handler sends virus/assets.generated with all NULLs so audio.synthesized fires.
```

**Idempotencia y no-double-charge:** Cada operación con efectos externos (Luma call, Gemini call, Storage upload) vive en su propio `step.run()`. Inngest memoiza el resultado de cada step exitoso, así que en una retry esos steps NO se re-ejecutan — devuelven el resultado cacheado. La fila `claim-row` con `ON CONFLICT DO UPDATE RETURNING` actúa como mutex distribuido a nivel DB para coalescer generaciones concurrentes del mismo prompt.

#### 6. Cambios en `synthesize-audio.ts`

Cambia su trigger de `virus/script.generated` a `virus/assets.generated`. **No** cambia su lógica.

Trade-off documentado: si `assets.generated` falla catastróficamente (ej. el evento no se emite), el pipeline se cuelga. Mitigamos con: el `onFailure` de `generate-visual-assets` SIEMPRE emite `assets.generated` con assets NULL, así audio siempre arranca.

**Observabilidad de fallback masivo:** además del `assets.generated` always-emit, emitimos un `virus/assets.failed` por slot fallado. Un job de monitoreo (Inngest scheduled function `monitor-assets-failure-rate`, corre cada 15min) cuenta el % de slots NULL en la última hora; si supera 20% → INSERT en `job_events` con `step='monitoring.assets_high_failure'` y `payload={rate, threshold}`. Esto cumple la regla global "flag anomalies > 20%". Alerting via PostHog/Sentry ya existente lo recoge.

#### 7. Componentes Remotion nuevos

Archivos:
- `packages/remotion/src/components/AIBackgroundVideo.tsx`
- `packages/remotion/src/components/AIHeroImage.tsx`
- `packages/remotion/src/components/AssetBackdrop.tsx` (wrapper que decide cuál usar)

Comportamiento:
- `<AIBackgroundVideo url={...} themeColor={...}>`: renderiza el video como `<OffthreadVideo>` con tinte oscuro encima (`rgba(0,0,0,0.55)`) + vignette + slow Ken Burns scale 1.0 → 1.08. Si `url` es null/undefined → renderiza nada (cae a fondo del template).
- `<AIHeroImage url={...} themeColor={...}>`: renderiza la imagen con parallax (movimiento horizontal sutil 0-30px), Ken Burns scale, y glow del themeColor.
- `<AssetBackdrop slot="hook" assets={video.assets}>`: lee del prop `assets` y delega a uno u otro.

**Defensa contra URLs rotas:** los tres componentes están envueltos en un Remotion error boundary que retorna `null` ante cualquier error de carga. Adicionalmente, `render-video.ts` hace `HEAD` a cada URL antes de armar el `RenderInputProps` y reemplaza por `undefined` cualquier URL que devuelva 4xx/5xx. Esto previene que una URL muerta crashee el render Lambda completo. Asset NULL → black bg → video sigue.

Layering en el template:
```
[ AbsoluteFill ]
  └ <BackgroundMusic />
  └ <VoiceoverAudio />
  └ <AssetBackdrop slot="hook" .../>     ← NUEVO, capa más al fondo
  └ <HookCard />                          ← existente, encima del backdrop
  └ <CodeBlock />                         ← existente
  └ <CtaCard />                           ← existente
  └ <Captions />                          ← existente, capa más al frente
```

#### 8. Cambios en templates

`packages/remotion/src/templates/tip/index.tsx` y `hot-take/index.tsx`:

- Aceptan nuevo prop opcional `assets?: { hook?: AssetRef; reveal?: AssetRef; cta?: AssetRef }`
- Para cada `<Sequence>` con `seg.role` en `[hook, reveal, cta]`, anteponer `<AssetBackdrop slot={seg.role} assets={assets} />`
- Si `assets` es undefined → todo se comporta exactamente como hoy (backwards compatible)

`schema.ts` de cada template: agregar `assets` como `z.object({ hook: AssetRef.optional(), ... }).optional()`.

#### 9. Cambios en `render-video.ts`

- Incluir `assets` en `RenderInputProps` cuando se llama a `startRender`.
- Lee de `videos.metadata.assets` (ids) → SELECT a `visual_assets` para obtener `storage_path`.
- Para cada asset: genera **signed URL fresh con TTL 1h** vía `supabase.storage.createSignedUrl()`. NO lee `storage_url` del DB (esa columna no existe).
- Antes de pasar las URLs al render: `HEAD` request a cada una. Si 4xx/5xx → reemplaza por `undefined` y loguea `job_event` con `step='render.url_check_failed'`.
- Pasa el objeto `assets` completo al input prop del template. Si todos vienen `undefined`, el template renderiza como hoy.

#### 10. UI: dashboard

**Modal "Generar video" (existente, en `/dashboard/ideas`):**

Antes de aprobar la idea, mostrar 3 dropdowns:

```
Visual del hook:    [Generar fresh ▾]   ← default
Visual del reveal:  [Generar fresh ▾]
Visual del CTA:     [Generar fresh ▾]
```

Opciones por dropdown: `Generar fresh`, `Reusar de biblioteca`, `Elegir manual…`.

`Elegir manual…` abre un modal secundario con grid de thumbnails filtrado por categoría + themeColor.

La selección se persiste en `video_ideas.metadata.asset_choices` antes de disparar `idea.approved`.

**Schema (Zod, en `@virus/shared/visuals/types.ts`)**, validado en ambos extremos (write desde web, read desde worker):

```ts
export const AssetChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fresh') }),
  z.object({ mode: z.literal('reuse') }),
  z.object({ mode: z.literal('manual'), assetId: z.string().uuid() }),
]);

export const AssetChoicesSchema = z.object({
  hook:   AssetChoiceSchema.default({ mode: 'fresh' }),
  reveal: AssetChoiceSchema.default({ mode: 'fresh' }),
  cta:    AssetChoiceSchema.default({ mode: 'fresh' }),
});
```

**Página nueva `/dashboard/assets`:**

- Tabla de la biblioteca del proyecto activo.
- Filtros: categoría (`hook|reveal|cta`), tipo (`video|image`), provider, burned/no burned, tags.
- Cada fila: thumbnail (preview con `<video muted loop>` o `<img>`), prompt, use_count, last_used_at, botones [Tag] [Regenerar variante] [Eliminar].
- Al "Regenerar variante": dispara una generación fresh con el mismo prompt → crea un asset nuevo (no sobrescribe).
- Al "Eliminar": soft-delete (marca `burned=true`) — los videos pasados que lo usaron siguen funcionando porque guardan `storage_url` en `videos.metadata.assets`.

#### 11. API endpoints nuevos

- `GET /api/assets?projectId=&category=&burned=` — lista assets del proyecto activo
- `POST /api/assets/[id]/regenerate` — encola un job de regeneración con el mismo prompt
- `DELETE /api/assets/[id]` — marca burned=true
- `PATCH /api/assets/[id]` — actualiza tags

Patrón: handlers en `apps/web/src/app/api/assets/...`, RLS hace el resto.

### Variables de entorno nuevas

| Variable | Default | Notas |
|---|---|---|
| `GOOGLE_AI_API_KEY` | (required) | https://aistudio.google.com/apikey. Billing habilitado. |
| `LUMA_API_KEY` | (required) | https://lumalabs.ai/dream-machine/api. Pre-cargar créditos. |
| `FAL_KEY` | (opcional) | https://fal.ai/dashboard/keys. Solo si querés fallback más barato. |
| `VISUAL_ASSETS_BUCKET` | `visual-assets` | Bucket de Supabase Storage. |
| `ASSETS_ENABLED` | `false` en prod, `true` en dev | Kill switch. Si false: pipeline opera como antes (synthesize-audio listens to `script.generated`). |
| `ASSETS_MAX_USD_PER_USER_DAILY` | `20` | Cap de gasto por usuario en 24h. |
| `ASSETS_MAX_USD_GLOBAL_DAILY` | `200` | Cap de gasto global en 24h. |
| `ASSETS_LUMA_MODEL` | `ray-2` | Override del modelo Luma. |
| `ASSETS_GEMINI_MODEL` | `imagen-4` | Override del modelo de imagen. |

`.env.local` (dev) y Vercel/Inngest Cloud (prod) — agregar `GOOGLE_AI_API_KEY` y `LUMA_API_KEY` como mínimo.

### Routing condicional por feature flag

Para que el flag `ASSETS_ENABLED` actúe como kill switch real, `generate-script.ts` cambia su evento de salida según el flag:

```ts
// al final de generate-script.ts
const nextEvent = process.env.ASSETS_ENABLED === 'true'
  ? 'virus/script.generated'      // → triggerea generate-visual-assets, que después emite assets.generated
  : 'virus/assets.skipped';        // → bypass directo

await step.sendEvent('next', { name: nextEvent, data: { videoId } });
```

`synthesize-audio.ts` se suscribe a **ambos** eventos: `virus/assets.generated` y `virus/assets.skipped`. Esto permite flippear el flag sin redeploy. (El evento `script.generated` se mantiene como nombre histórico pero ahora apunta al pipeline con assets cuando el flag está on.)

**Concurrencia documentada:** El flag se lee al momento de emitir el evento. Si se flippea mid-pipeline, los videos en vuelo terminan con la lógica vieja (no se interrumpen). Solo videos nuevos respetan el flag nuevo.

### Costos

- Luma Ray 2 a 720p: $0.06/seg × 6s × 2 clips (hook + cta) = $0.72
- Gemini 2.5 Flash Image: $0.039 × 1 (reveal) = $0.04
- Total por video con todo fresh: **~$0.76**
- Con 1 slot reusado: **~$0.40**
- Con todos reusados: **$0**

(Recalculado más bajo que la estimación inicial porque solo 2 de los 3 slots usan video — `reveal` usa imagen, que es 50× más barata. Hook y CTA se quedan como video porque son donde más impacta el movimiento.)

### Decisiones explícitas: video vs imagen por slot

| Slot | Tipo | Por qué |
|---|---|---|
| hook | video Luma | Primer 0-3s, retention crítica. El movimiento engancha. |
| reveal | imagen Gemini | El "punchline" se sostiene mejor con composición fuerte estática + Ken Burns. Más barato. |
| cta | video Luma | Cierre. El movimiento da signal de calidad alta y empuja al swipe. |

## Testing

- `packages/shared/src/visuals/prompts/build.test.ts`: verifica que prompts generados incluyen los descriptores fijos del estilo y respetan `themeColor`.
- `packages/shared/src/visuals/cache/lookup.test.ts`: cache hit/miss/burned.
- `apps/worker/src/functions/generate-visual-assets.test.ts`: mocks de providers, casos: todo fresh, todo reuso, mix, fallback por timeout, fallback por API error, manual_id válido/inválido.
- E2E manual: generar 1 video con todo fresh, verificar que aparecen los 3 backdrops en el render final.
- Visual regression: snapshot del primer frame de cada slot (Remotion `remotion-renderStill`).

## Rollout

1. Mergear migraciones (`0014_visual_assets.sql`, `0015_visual_assets_bucket.sql`, `0016_provider_spend_log.sql`).
2. Deploy worker con `generate-visual-assets` + cambios en `synthesize-audio.ts` y `render-video.ts`.
3. Deploy web con UI nueva (modal de asset_choices + página `/dashboard/assets` + endpoints `/api/assets/*`).
4. **Feature flag `ASSETS_ENABLED`**:
   - Default en local: `true` (para testear).
   - **Default en prod: `false`** hasta validar 3 videos de prueba. Cuando esté `false`: `synthesize-audio` mantiene su trigger original `script.generated` (no `assets.generated`) — el flag controla TODO el cambio de routing.
   - Una vez validado → flippear a `true`. Si surgen problemas → flippear de vuelta a `false` sin código (kill switch real).
5. Generar 3 videos de prueba en local con `ASSETS_ENABLED=true`. Templates: 1× `tip`, 2× `hot-take`. Comparar con video previo. Si ✓ → habilitar en prod.
6. Aplicar a los otros 5 templates (`comparison`, `listicle`, `speed-build`, `story-bug`, `hello`) en iteración futura.

## Open questions

1. ¿Querés que "Generar fresh" sea el default permanente o que el sistema empiece a sugerir reuso cuando hay assets disponibles que matchean? (Recomendación: por ahora fijo en "fresh", agregamos sugerencia en V2.)
2. ¿Cuántos retries para Luma cuando devuelve "queue full"? Default propuesto: 1 retry con backoff 30s, después fallback. ¿OK?
3. ¿Aplicamos esto inmediatamente a `hot-take` también o solo `tip` primero? Recomendación: ambos al mismo tiempo, son el 80% del uso.

## Out of scope / V2

- Aplicar a templates `comparison`, `listicle`, `speed-build`, `story-bug`, `hello`.
- Veo 3 / Runway Gen-4 / Kling como alternativas a Luma (configurables per-proyecto).
- Sistema de "estilos visuales" alternativos (synthwave, abstracto, claro) seleccionables per-proyecto.
- Auto-tagging de assets con Claude Vision para mejor búsqueda en biblioteca.
- Sistema de scoring por asset (ligar `video_performance` con `visual_assets` para detectar cuáles convierten más).
- Generación de thumbnails de YouTube/Reels desde el mismo asset.
