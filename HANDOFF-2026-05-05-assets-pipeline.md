# Handoff — 2026-05-05 — Cinematic AI Visual Assets Pipeline

## TL;DR

Implementé toda la pipeline de assets cinematográficos (Luma Ray + Gemini "Nano Banana") sobre el pipeline existente de Virus. **37 commits, 8 fases, ~50 archivos**.

Para que el primer video premium funcione, vos tenés que hacer 6 cosas manuales (abajo). En cuanto termines esos pasos, el flujo end-to-end está listo.

---

## ⚠️ ANTES DE NADA — rotá las API keys

Las dos keys que pegaste en el chat ahora viven en el transcript:
- Google AI Studio: `AIzaSyDl…coso`
- Luma: `luma-api-PNof…1V-U`

**Cómo rotar (5 minutos total):**
1. Google: https://aistudio.google.com/apikey → eliminá la actual + create new
2. Luma: https://platform.lumalabs.ai/keys → delete "virus" + Create Key (nombre nuevo)
3. Reemplazá los valores en `apps/worker/.env.local` y `apps/web/.env.local`. Las variables se llaman `GOOGLE_AI_API_KEY` y `LUMA_API_KEY`.

---

## Pasos manuales para activar el primer video premium

### 1. Aplicar las migraciones a Supabase

Hay 5 migraciones nuevas (`0014` a `0018`) en `packages/db/migrations/`. La forma más simple:

**Opción A — Dashboard SQL Editor (lo más rápido):**
1. Ir a https://supabase.com/dashboard/project/jdkjnaivkucnpvmwuraz/sql/new
2. Copiar y pegar el contenido de cada archivo en orden:
   - `packages/db/migrations/0014_visual_assets.sql`
   - `packages/db/migrations/0015_visual_assets_bucket.sql`
   - `packages/db/migrations/0016_usage_records_extend.sql`
   - `packages/db/migrations/0017_assets_alert_rpc.sql`
   - `packages/db/migrations/0018_videos_metadata.sql`
3. Ejecutar cada uno (Ctrl+Enter), verificar que devuelva "Success"

**Opción B — Supabase CLI (si tenés el proyecto vinculado):**
```bash
supabase link --project-ref jdkjnaivkucnpvmwuraz   # solo si nunca lo hiciste
supabase db push
```

**Verificar después de aplicar:**
```sql
-- en SQL Editor
SELECT count(*) FROM visual_assets;          -- 0 (existe la tabla)
SELECT count(*) FROM video_assets_used;      -- 0
SELECT * FROM storage.buckets WHERE id='visual-assets';  -- 1 fila
SELECT sum_visual_spend_last_24h_user('00000000-0000-0000-0000-000000000000'::uuid);  -- 0
SELECT * FROM compute_assets_failure_rate(60);  -- (0,0,0)
SELECT column_name FROM information_schema.columns WHERE table_name='videos' AND column_name='metadata';  -- 1 fila
```

### 2. Regenerar TypeScript types de Supabase

```bash
cd C:/MisProyectos/Armagedon/virus
supabase gen types typescript --project-id jdkjnaivkucnpvmwuraz > packages/db/src/types.gen.ts
```

Esto elimina los `(supabase as any)` casts que el agente de UI dejó como fallback en `apps/web/src/app/api/assets/...`. Después de regenerar, podés hacer una pasada de cleanup (opcional, no crítico).

### 3. Re-deployar el sitio Remotion a Lambda

Los templates `tip` y `hot-take` ahora usan `<AssetBackdrop>`. Hasta que no redeployes, el `serveUrl` de Lambda sigue apuntando al bundle viejo y los `assets` en `RenderInputProps` se ignoran silenciosamente.

```bash
cd C:/MisProyectos/Armagedon/virus/infra/remotion-lambda
npm run deploy
```

Pre-requisitos: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` configurados (ya los tenés del setup original).

Tomá nota del nuevo `serveUrl` que imprime el comando — si tu worker tiene un `REMOTION_SERVE_URL` hardcodeado, actualizalo. Si lee del `package.json` de Lambda dinámicamente, no hace falta.

### 4. Reiniciar worker + dev server

```bash
# Matar lo que esté corriendo en :3001 (web) y :8288 (inngest dev)
cd C:/MisProyectos/Armagedon/virus
pnpm dev
```

Y por separado (porque `pnpm dev` no arranca el Inngest dev server, según tu memoria del proyecto):
```bash
npx inngest-cli@latest dev --no-discovery -u http://localhost:3001/api/inngest
```

Verificá en http://localhost:8288 que aparezcan las funciones nuevas:
- `generate-visual-assets`
- `monitor-assets-failure-rate`

Y los eventos nuevos:
- `virus/assets.requested`
- `virus/assets.generated`
- `virus/assets.skipped`
- `virus/assets.failed`

### 5. Confirmar que `ASSETS_ENABLED=true` está activo

```bash
grep ASSETS_ENABLED apps/worker/.env.local
# debería decir: ASSETS_ENABLED=true
```

Lo dejé en `true` para local (ya lo seteé al pegar las keys). En producción está en `false` por default — flippealo después de validar.

### 6. Generar el primer video premium

1. Abrí http://localhost:3001/dashboard/ideas (o el puerto que use tu web — chequeá `pnpm dev`)
2. Hacé click en "Generar video de prueba" (arriba a la derecha)
3. Te lleva a `/dashboard/pipeline` y vas a ver:
   - `pending` → `scripting` (~30s) → **`assets-generating`** ← NUEVO (~30-60s) → `audio` → `captions` → `rendering` → `ready`
4. Cuando termine, abrís el video y debería tener:
   - **Hook**: backdrop de video Luma (terminal/keyboard cinematográfico) detrás del HookCard
   - **Reveal**: imagen Gemini de fondo con Ken Burns + parallax
   - **CTA**: backdrop de video Luma detrás del CtaCard
5. Comparalo con el video viejo — debería verse 10× más premium.

**Si algo falla**: el sistema cae a fondo negro automáticamente, el video se genera igual. Mirá en `/dashboard/pipeline` el botón "Reintentar" si dice "failed".

---

## Costos esperados por video

| Slot | Tipo | Provider | Costo |
|------|------|----------|-------|
| hook | video 6s | Luma Ray 2 720p | $0.36 |
| reveal | imagen | Gemini Imagen 4 | $0.04 |
| cta | video 5s | Luma Ray 2 720p | $0.30 |
| **Total fresh** | | | **~$0.70** |
| Con cache hit (1 slot) | | | ~$0.40 |
| Todo reusado | | | $0.00 |

Hay un **circuit breaker automático**: si gastás >$20/día (vos) o >$200/día (cuenta global), todos los assets caen a NULL y el video se genera con fondo negro. Los caps son configurables en `.env.local`:
- `ASSETS_MAX_USD_PER_USER_DAILY=20`
- `ASSETS_MAX_USD_GLOBAL_DAILY=200`

---

## Qué hace el sistema (resumen visual)

### Pipeline antes
```
idea → script → audio → captions → render → ready
                                  └─ Remotion solo: texto + código sobre fondo NEGRO
```

### Pipeline ahora
```
idea → script → assets ← NUEVO ─→ audio → captions → render → ready
                  ↓                                      ↓
       Luma Ray (videos 5-8s)                  HEAD-check + signed URLs 1h
       Gemini (imágenes 9:16)
       Cache hit por prompt_hash
       Circuit breaker $20/día
       Fallback automático
                                  └─ Remotion: texto + código + AI BACKDROP cinematográfico
```

### Estilo visual fijo: "Cinematic Dev Noir"
- Cámara: shallow depth of field, slow dolly-in, anamorphic feel
- Luz: dim ambient + light shafts + dust particles
- Color: acento neón en `themeColor` (verde Supabase #3ECF8E por default)
- Sujetos: terminales, mecánicos RGB, monitores, manos tipeando, hardware close-up
- Negative: matrix code rain, glitch fake-hacker, wide shots, deformed hands

### Sistema de reuso (en el dashboard)

Cuando aprobás una idea desde `/dashboard/ideas`, ahora aparece un dialog con 3 dropdowns:
```
Hook visual:    [Generar fresh ▾]
Reveal visual:  [Generar fresh ▾]
CTA visual:     [Generar fresh ▾]
```
- **Generar fresh** (default): genera nuevo, ~$0.70 total
- **Reusar de biblioteca**: agarra uno random no-usado-en-14-días, $0
- **Elegir manual…**: modal con thumbnails para que elijas vos

Y hay una página nueva `/dashboard/assets` (link "Biblioteca" en el sidebar) donde ves toda la biblioteca con filtros, podés taguear, regenerar variantes, o "quemar" assets para que dejen de aparecer en random.

---

## Archivos creados (cherry-pick si querés revisar)

### DB (migraciones)
- `packages/db/migrations/0014_visual_assets.sql`
- `packages/db/migrations/0015_visual_assets_bucket.sql`
- `packages/db/migrations/0016_usage_records_extend.sql`
- `packages/db/migrations/0017_assets_alert_rpc.sql`
- `packages/db/migrations/0018_videos_metadata.sql`

### Shared package (lógica core)
- `packages/shared/src/visuals/types.ts`
- `packages/shared/src/visuals/hash.ts`
- `packages/shared/src/visuals/prompts/style.ts`
- `packages/shared/src/visuals/prompts/build.ts`
- `packages/shared/src/visuals/cache/lookup.ts`
- `packages/shared/src/visuals/providers/luma.ts`
- `packages/shared/src/visuals/providers/gemini.ts`
- `packages/shared/src/visuals/providers/index.ts`
- `packages/shared/src/visuals/index.ts`
- `packages/shared/src/visuals/__tests__/*` (34 tests)

### Worker (Inngest)
- `apps/worker/src/functions/generate-visual-assets.ts` (función principal, ~570 líneas)
- `apps/worker/src/functions/monitor-assets-failure-rate.ts`
- `apps/worker/src/functions/__tests__/generate-visual-assets.test.ts` (6 tests)

### Remotion (componentes)
- `packages/remotion/src/components/AssetErrorBoundary.tsx`
- `packages/remotion/src/components/AIBackgroundVideo.tsx`
- `packages/remotion/src/components/AIHeroImage.tsx`
- `packages/remotion/src/components/AssetBackdrop.tsx`

### Web (UI)
- `apps/web/src/app/(dashboard)/dashboard/assets/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/assets/_components/assets-grid.tsx`
- `apps/web/src/app/(dashboard)/dashboard/ideas/_components/asset-choices-form.tsx`
- `apps/web/src/app/api/assets/route.ts`
- `apps/web/src/app/api/assets/[id]/route.ts`
- `apps/web/src/app/api/assets/[id]/regenerate/route.ts` (stub 501 — V2)

### Modificados
- `packages/inngest/src/client.ts` (4 eventos nuevos)
- `apps/worker/src/functions/generate-script.ts` (gating por flag)
- `apps/worker/src/functions/synthesize-audio.ts` (multi-trigger)
- `apps/worker/src/functions/render-video.ts` (signed URLs + HEAD)
- `apps/worker/src/index.ts` (registry)
- `apps/worker/src/events/video-events.ts`
- `packages/inngest/src/functions/index.ts`
- `packages/remotion/src/templates/tip/{schema.ts,index.tsx}`
- `packages/remotion/src/templates/hot-take/{schema.ts,index.tsx}`
- `packages/remotion/src/components/index.ts`
- `packages/shared/src/render/types.ts`
- `apps/web/src/app/(dashboard)/dashboard/ideas/_components/ideas-client.tsx`
- `apps/web/src/app/api/ideas/[id]/approve/route.ts`
- `apps/web/src/app/api/ideas/test-seed/route.ts`
- `apps/web/src/lib/nav-config.ts`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/command-palette.tsx`
- `.env.example`

---

## Spec + plan completos

Si querés revisar las decisiones arquitectónicas:
- Spec con razonamiento: `docs/superpowers/specs/2026-05-05-cinematic-ai-assets-pipeline-design.md`
- Plan de implementación task-by-task: `docs/superpowers/plans/2026-05-05-cinematic-ai-assets-pipeline.md`

Ambos pasaron por revisión arquitectónica antes de ejecutar (2 rondas de spec, 1 ronda de plan implícita).

---

## Cosas que quedaron como TODO (V2)

1. **Endpoint `POST /api/assets/[id]/regenerate`** está stubeado a 501. Es low-priority — la UI solo lo expone en `/dashboard/assets` para regenerar variantes manualmente. La generación on-demand sigue funcionando perfectamente desde el flujo de "Aprobar y generar".

2. **5 templates restantes** (`comparison`, `listicle`, `speed-build`, `story-bug`, `hello`) NO usan `<AssetBackdrop>` todavía. Solo `tip` y `hot-take`. Se replicará después de validar que el primer video se ve bien.

3. **Auto-tagging con Claude Vision** de los assets para mejor búsqueda en biblioteca: idea V2.

4. **Scoring por asset**: ligar `video_performance` con `visual_assets` para detectar cuáles convierten más: idea V2.

5. **`monitor-assets-failure-rate`** logea con `console.warn` (lo recoge Sentry/PostHog). Idealmente debería tener una tabla `system_alerts` propia. Pequeña deuda técnica, no crítica.

6. **Pre-existing typecheck errors** en `apps/worker` (`anti-repeat-policy.ts`, `whisper-fallback.ts`) y `apps/web` (mismo whisper-fallback) NO son de este trabajo — son anteriores. Conviene fixearlos en una pasada de cleanup separada, sino la pipeline funciona igual (TS errors no rompen runtime).

---

## Tests

```bash
cd C:/MisProyectos/Armagedon/virus
pnpm --filter @virus/shared test visuals    # 34/34 ✅
pnpm --filter @virus/worker test generate-visual-assets   # 6/6 ✅
pnpm --filter @virus/shared typecheck       # ✅ clean
pnpm --filter @virus/remotion typecheck     # ✅ clean
pnpm --filter @virus/inngest typecheck      # ✅ clean
pnpm --filter @virus/web typecheck          # ✅ clean (excepto pre-existing whisper-fallback)
pnpm --filter @virus/worker typecheck       # ✅ clean en archivos nuevos (errores pre-existentes en anti-repeat-policy)
```

---

## Resumen de commits (37 total)

Si querés ver el diff completo:
```bash
cd C:/MisProyectos/Armagedon/virus
git log --oneline 0dc9c87..HEAD     # commits desde el baseline
```

Si querés revertir todo (zero damage):
```bash
git reset --hard 0dc9c87
```
(Los archivos de las migraciones quedan en disco como `.sql` files pero la DB no fue tocada por mí — vos no las aplicaste todavía.)
