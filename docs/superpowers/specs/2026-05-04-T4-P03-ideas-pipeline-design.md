# Design Spec — T4-P03: Ideas + Pipeline + Video Detail

**Date:** 2026-05-04  
**Task:** T4-P03  
**Depends on:** T4-P01 (app shell), T2-P03 (Claude integration), T2-P07 (Inngest)  
**Approach:** A — Server Components + cookie de proyecto activo

---

## 1. Arquitectura general

### Patrón de proyecto activo

El proyecto activo se almacena en una cookie HTTP `virus_active_project_id`. El layout de T4-P01 la escribe cuando el usuario cambia proyecto desde el switcher. Cada Server Component de este task la lee con `cookies()` de `next/headers`.

**Flujo de primer acceso (sin cookie) — via Server Action:**

La detección y escritura de cookie NO puede ocurrir directamente en un Server Component (Next.js App Router no lo permite). El flujo correcto:

1. Server Component detecta cookie vacía (`cookies().get('virus_active_project_id')` es undefined).
2. Renderiza un Client Component `<ActiveProjectBootstrap>` que llama a un Server Action `resolveActiveProject()`.
3. El Server Action: llama `fetchProjectsList(userId)` → si vacía → `redirect('/dashboard/onboarding')`. Si hay proyectos → toma el primero → `cookies().set('virus_active_project_id', firstProject.id)` → `revalidatePath(pathname)`.
4. En el re-render post-action, el Server Component ya tiene la cookie y carga los datos.

**Usuario sin proyectos:** redirect a `/dashboard/onboarding` (pantalla de T4-P07). Nunca loop.

**Seguridad:** Antes de cualquier query, verificar que `project.user_id === auth.uid()`. Si no coincide → responder 404 (no 403, para no revelar existencia del recurso).

### Árbol de archivos

```
apps/web/src/
├── app/(dashboard)/dashboard/
│   ├── ideas/
│   │   └── page.tsx                        # Server Component
│   ├── pipeline/
│   │   └── page.tsx                        # Server Component
│   └── videos/
│       └── [id]/
│           └── page.tsx                    # Server Component
│
├── components/ideas/
│   ├── ideas-grid.tsx                      # Client — grid + useOptimistic
│   ├── idea-card.tsx                       # Client — card individual
│   ├── ideas-filters.tsx                   # Client — filtros
│   ├── generate-ideas-modal.tsx            # Client — modal generación
│   └── idea-edit-popover.tsx               # Client — edición inline
│
├── components/pipeline/
│   ├── pipeline-board.tsx                  # Client — Kanban + Realtime
│   ├── pipeline-column.tsx                 # Client — columna individual
│   └── pipeline-card.tsx                   # Client — card con animaciones
│
├── components/videos/
│   ├── video-detail-header.tsx             # Client — header + acciones
│   ├── video-tabs.tsx                      # Client — tabs shell
│   ├── tab-preview.tsx                     # Client — video player
│   ├── tab-script.tsx                      # Presentational
│   ├── tab-captions.tsx                    # Client — export SRT/VTT
│   ├── tab-audio.tsx                       # Client — audio player
│   ├── tab-descriptions.tsx                # Client — copy buttons
│   └── tab-performance.tsx                 # Client — recharts
│
├── server/active-project.ts               # Server Action: resolveActiveProject()
│
└── app/api/
    ├── ideas/
    │   ├── generate/route.ts
    │   ├── [id]/route.ts                   # PATCH — edit idea
    │   └── rewrite/route.ts               # POST — hook rewriter
    └── videos/
        ├── route.ts                        # POST — crear video (aprobar idea)
        └── [id]/
            ├── publish/route.ts            # POST — marcar como publicado
            ├── reject/route.ts
            └── rerender/route.ts
```

### Decisiones de implementación

| Decisión | Elección |
|----------|----------|
| Cookie write | Server Action `resolveActiveProject()` — no en Server Component |
| Drag & drop Kanban | No — el status lo mueve el worker |
| Optimistic UI en ideas | `useOptimistic` de React 19 con rollback explícito |
| Realtime pipeline | Supabase channel con filter string explícito |
| Captions export | Generar SRT/VTT en cliente (JS puro) |
| Performance charts | recharts |
| Video player | HTML5 `<video>` nativo |
| Zod validation | En cada API route |

---

## 2. Pantalla `/dashboard/ideas`

### Server Component (`page.tsx`)

Carga en paralelo con `Promise.all`:
- Lista de `video_ideas` del proyecto activo (límite 100, orden `created_at` DESC).
- Lista de `content_pillars` del proyecto.

```ts
supabase
  .from('video_ideas')
  .select('id, hook, angle, format, estimated_duration, risk_level, rationale, status, pillar_id, created_at')
  .eq('project_id', projectId)
  .order('created_at', { ascending: false })
  .limit(100)
```

### `<IdeasGrid>` — Client Component

Estado local:
- `ideas` inicializado con las ideas del server.
- `filter` — `{ pillar: string | null; status: string | null }`.
- `useOptimistic` sobre la lista de ideas para acciones de approve/reject.

**Patrón de useOptimistic:** aplicar el update optimistic dentro de `startTransition`. Cuando la transición termina, React revierte automáticamente el estado optimistic al último estado real comprometido. Si la fetch falla y el estado real no se actualiza, el revert es automático — no se necesita lógica de revert manual. Disparar `toast.error()` en el catch para feedback al usuario.

Ideas filtradas = `ideas.filter(...)` sobre el estado local, sin request adicional.

Layout:
- Header: "Ideas" + contador `(N)` + botón hero **"Generar 5 ideas"**.
- `<IdeasFilters>` debajo.
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- Empty state si `ideas.length === 0`: ilustración + botón de generar + texto "Generá tus primeras ideas para empezar".

### `<IdeaCard>` — Client Component

```
┌─────────────────────────────────────┐
│ [BADGE pillar]  [BADGE format]      │
│                                     │
│ Hook (text-lg font-semibold)        │
│ Angle (text-sm textSecondary)       │
│                                     │
│ ── Rationale (collapsible) ──       │
│ [riskLevel badge]  [duration]       │
│                                     │
│ [Aprobar ✓] [✏] [✗] [♻️]           │
└─────────────────────────────────────┘
```

Colores pillar badge: `educational` → `#0175C2`, `hot_take` → `#FFC000`, `personal` → `#8B5CF6`.
Colores riskLevel: `safe` → `success`, `edgy` → `warning`, `high-risk` → `danger`.

**Acciones:**

1. **Aprobar** → `useOptimistic` cambia status a `approved` → `POST /api/videos { ideaId }`. En error: rollback automático + `toast.error("Error al aprobar. Intentá de nuevo.")`.

2. **Editar** → `<IdeaEditPopover>` anclado a la card. Campos: `hook` (textarea max 80 chars con contador) y `angle`. Submit → `PATCH /api/ideas/[id]`. Actualiza estado local en éxito.

3. **Rechazar** → `useOptimistic` cambia status a `rejected` → `PATCH /api/ideas/[id] { status: 'rejected' }`. La card colapsa con `AnimatePresence` de Framer Motion (opacity 0, height 0, 300ms). En error: rollback + toast.

4. **Pedir variantes** (♻️) → `POST /api/ideas/rewrite { ideaId }` → spinner en botón → agrega 5 nuevas ideas al inicio del array local → toast "5 variantes generadas".

### `<GenerateIdeasModal>` — Client Component

`<Dialog>` con `<Select>` de pillar → `POST /api/ideas/generate { pillar, count: 5 }`. Botón muestra spinner "Generando...". En éxito: cierra modal + prepend ideas al grid + toast.

### `<IdeasFilters>` — Client Component

`<Select>` de pillar (Todos / Educational / Hot Take / Personal) y status (Todos / Borradores / Aprobadas / Rechazadas). Operan sobre estado local. Botón "Limpiar" visible si algún filtro activo.

---

## 3. Pantalla `/dashboard/pipeline`

### Server Component (`page.tsx`)

```ts
// Incluir publicados de los últimos 7 días para mostrar en la columna Published
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

supabase
  .from('videos')
  .select('id, status, template, theme_color, error, created_at, updated_at, idea_id, video_ideas!inner(hook)')
  .eq('project_id', projectId)
  .or(`status.neq.published,published_at.gte.${sevenDaysAgo}`)
  .order('updated_at', { ascending: false })
  .limit(200)
```

Esto incluye todos los no-publicados + publicados de los últimos 7 días, manteniendo la columna `published` útil sin cargar el histórico completo.

### `<PipelineBoard>` — Client Component

Recibe `projectId` como prop desde el Server Component (nunca lo lee de cookie en cliente).
Inicializa estado con `videos` recibidos como prop desde el server.

Suscripción a Supabase Realtime — `projectId` siempre es string no-nulo al momento de la suscripción porque viene del server:

```ts
// props: { projectId: string; initialVideos: VideoRow[] }
const [videos, setVideos] = useState(initialVideos)

useEffect(() => {
  const channel = supabase
    .channel(`pipeline:${projectId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'videos',
      filter: `project_id=eq.${projectId}`,   // formato exacto requerido por Supabase
    }, (payload) => {
      setVideos(prev =>
        prev.map(v => v.id === payload.new.id ? { ...v, ...payload.new } : v)
      )
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'videos',
      filter: `project_id=eq.${projectId}`,
    }, (payload) => {
      setVideos(prev => [payload.new as VideoRow, ...prev])
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [projectId])
```

Layout: 6 columnas con `overflow-x-auto`, cada columna `min-w-[220px]`.
Columnas: `pending | scripting | audio | rendering | ready | published`.

Cada columna: header (nombre + contador) + lista de cards + placeholder "Sin videos" si vacía.

### `<PipelineCard>` — Client Component

```
┌──────────────────────────────┐
│ [●] scripting                │
│                              │
│ "Hook truncado..."  (1 línea)│
│ Template: tip                │
│                              │
│ hace 12 min                  │
└──────────────────────────────┘
```

Colores indicator `●`:
- `pending` → `statusPending` (#A8B0BC), sin animación
- `scripting | audio | rendering` → `statusProcessing` (#0175C2) + `animate-pulse`
- `ready` → `statusReady` (#3ECF8E)
- `published` → verde tenue
- video con `error !== null` → `statusFailed` (#E57373) + borde rojo en la card

**Estado failed:** card con `border-danger`, texto de error truncado (1 línea), botón "Re-render" → `POST /api/videos/[id]/rerender`.

**Tiempo en estado:** `formatDistanceToNow(new Date(updated_at), { locale: es, addSuffix: true })` de `date-fns`. Actualizado cada 60s con `setInterval` en un custom hook `useRelativeTime`.

**Click en card** → `router.push('/dashboard/videos/${id}')`.

---

## 4. Pantalla `/dashboard/videos/[id]`

### Server Component (`page.tsx`)

```ts
const { data: video } = await supabase
  .from('videos')
  .select('*, video_ideas(hook, angle, format, pillar_id), video_performance(*)')
  .eq('id', videoId)
  .single()
```

**Signed URLs (server-side, 24h):** se generan solo si el path correspondiente no es null:

```ts
const signedVideoUrl = video.video_url
  ? await generateSignedUrl('videos', video.video_url, 86400)
  : null

const signedAudioUrl = video.audio_url
  ? await generateSignedUrl('audio', video.audio_url, 86400)
  : null

const signedThumbnailUrl = video.thumbnail_url  // columna a agregar a la query si existe
  ? await generateSignedUrl('thumbnails', video.thumbnail_url, 86400)
  : null
```

Props pasadas a Client Components incluyen los URLs o `null`. Los Client Components muestran estado "No disponible aún / procesando" cuando reciben `null`.

### `<VideoDetailHeader>` — Client Component

```
← Pipeline          [● ready]

Hook del video (text-2xl font-bold)
Template: tip  ·  Educational  ·  hace 2 horas

[⬇ Descargar MP4]   [⟳ Re-render]   [⋯]
```

- **Descargar MP4:** `<a href={signedVideoUrl} download>`. `disabled` + tooltip "El video aún no está listo" si `signedVideoUrl === null || !['ready','published'].includes(status)`.
- **Re-render:** `<AlertDialog>` de confirmación → `POST /api/videos/[id]/rerender`.
- **⋯ dropdown:** "Eliminar" con `<AlertDialog>` de confirmación → `DELETE /api/videos/[id]` (agregar esta route) → redirect a `/dashboard/pipeline`.

### `<VideoTabs>` — Client Component

Tabs con shadcn `<Tabs>`, 6 items:

**1. Vista previa**
- `<video src={signedVideoUrl} controls poster={signedThumbnailUrl} className="max-w-[320px] aspect-[9/16]">`.
- Si `signedVideoUrl === null`: placeholder con skeleton + "Video en procesamiento...".

**2. Script**
- Lista de segments del JSON (`video.script.segments`). Si `video.script === null`: "Script aún no generado".
- Cada segment: badge de rol coloreado + timestamps + voiceover en `font-mono` + visualCue en `textTertiary`.

**3. Captions**
- Si `video.captions === null`: "Captions aún no disponibles".
- Si existen: primeras 50 words visibles, resto colapsado con "Ver más".
- Botones **Exportar SRT** y **Exportar VTT**: generados 100% en cliente con JS puro.
  ```ts
  // SRT: índice + timestamps + texto, separado por líneas vacías
  // VTT: cabecera "WEBVTT" + cues con timestamps "HH:MM:SS.mmm --> HH:MM:SS.mmm"
  // Trigger: URL.createObjectURL(new Blob([content])) + <a download>
  ```

**4. Audio**
- `<audio src={signedAudioUrl} controls>`. Si `null`: "Audio en procesamiento...".
- Botón "Descargar MP3": `<a href={signedAudioUrl} download>`, disabled si null.

**5. Descripciones** (social copy — distinto de captions word-level del tab 3)
- 3 cards side-by-side (responsive: stack en mobile).
- Cada card: header plataforma + `<textarea readOnly>` con el texto social (`video.caption_instagram` / `video.caption_tiktok` / `video.caption_shorts`) + badges de hashtags (`video.hashtags`) + botón "Copiar" (`navigator.clipboard.writeText`).
- Si el campo es null: "Descripción no generada aún".

**6. Performance**
- Si `video_performance.length === 0`: empty state "Publicá el video y volvé en 24h para ver las métricas".
- Si hay datos: `<LineChart>` de recharts con views/likes/comments, una línea por plataforma. Eje X = `measured_at`.

### Sticky "Marcar como publicado"

Visible solo cuando `status === 'ready'`. Posición: `fixed bottom-0 left-0 right-0` con `backdrop-blur-md bg-bgElevated/80 border-t border-border`.

```
¿Ya lo subiste a las plataformas?    [✓ Marcar como publicado]
```

Click → `POST /api/videos/[id]/publish` → optimistic: oculta el banner + cambia status badge a `published` + toast "¡Publicado! Slot liberado en el calendario."

---

## 5. API Routes

### `POST /api/ideas/generate`

```ts
const schema = z.object({
  pillar: z.enum(['educational', 'hot_take', 'personal']),
  count: z.number().int().min(1).max(10).default(5),
})
// 1. Auth → project ownership
// 2. generateIdeas() de @virus/shared/ai
// 3. INSERT video_ideas (status: 'draft')
// 4. Return { ideas: rows[] }
```

### `PATCH /api/ideas/[id]`

Un único endpoint para dos casos de uso (todos los campos son opcionales):

```ts
const schema = z.object({
  hook: z.string().max(80).optional(),    // content edit: editar hook
  angle: z.string().optional(),           // content edit: editar angle
  status: z.enum(['draft', 'approved', 'rejected']).optional(), // status change: rechazar/restaurar
})
// Caller envía solo los campos que quiere cambiar.
// Ejemplo content edit: { hook: "nuevo hook", angle: "nuevo angle" }
// Ejemplo status:        { status: "rejected" }
// 1. Auth → ownership (idea → project → user)
// 2. UPDATE video_ideas SET solo los campos presentes
// 3. Return updated row
```

### `POST /api/ideas/rewrite`

```ts
const schema = z.object({ ideaId: z.string().uuid() })
// 1. Auth → ownership
// 2. Cargar idea original
// 3. hookRewriter() de @virus/shared/ai
// 4. INSERT 5 nuevas ideas (status: 'draft')
// 5. Return { ideas: newRows[] }
```

### `POST /api/videos`

```ts
const schema = z.object({ ideaId: z.string().uuid() })
// 1. Auth → verificar idea.project_id pertenece al user
// 2. INSERT videos { project_id, idea_id, status: 'pending', template, theme_color, language }
// 3. UPDATE video_ideas SET status = 'approved'
// 4. send('virus/idea.approved', { videoId, userId })
// 5. Return { videoId }
```

### `POST /api/videos/[id]/publish`

```ts
// Sin body
// 1. Auth → ownership
// 2. UPDATE videos SET status = 'published', published_at = now()
// 3. Return { ok: true }
```

### `POST /api/videos/[id]/rerender`

```ts
// Sin body
// 1. Auth → ownership
// 2. UPDATE videos SET status = 'pending', error = null
//    → limpiar error hace que la card deje de mostrarse como "failed" en el pipeline
// 3. send('virus/render.requested', { videoId })
// 4. Return { ok: true }
```

### `POST /api/videos/[id]/reject`

```ts
// Sin body
// 1. Auth → ownership
// 2. UPDATE videos SET status = 'rejected'
// 3. Return { ok: true }
```

### `DELETE /api/videos/[id]`

```ts
// Sin body
// 1. Auth → ownership
// 2. DELETE FROM videos WHERE id
// 3. Return { ok: true }
```

**Nota:** el redirect a `/dashboard/pipeline` ocurre en el Client Component (`VideoDetailHeader`) tras recibir la respuesta 200 — NO dentro del route handler. El route handler siempre retorna JSON.

---

## 6. UX / animación

| Elemento | Implementación |
|----------|----------------|
| Idea rechazada | `AnimatePresence` Framer Motion — opacity 0, height 0, 300ms |
| useOptimistic rollback | Automático al error + `toast.error()` con sonner |
| Pipeline processing | `animate-pulse` en indicator `●` |
| Realtime filter | `project_id=eq.${projectId}` — formato explícito Supabase |
| Assets null | UI disabled/placeholder explícito en cada tab |
| Toast | `sonner` (ya instalado) |
| Skeleton | shadcn `<Skeleton>` durante suspense |
| Empty states | Ilustración SVG inline + CTA contextual |
| Sin proyectos | Redirect a `/dashboard/onboarding` (no loop) |

---

## 7. Invariantes de seguridad

- `auth.uid()` verificado en TODAS las API routes como primer paso.
- Chain de ownership: `video → project → user` o `idea → project → user` verificado antes de mutar.
- Signed URLs generadas exclusivamente en Server Component, nunca en cliente.
- Inputs validados con Zod antes de cualquier DB operation.
- Error de ownership → `NextResponse.json({ error: 'Not found' }, { status: 404 })`.
- Cookie write solo via Server Action, nunca en Server Component directamente.

---

## 8. Dependencias externas requeridas

| Paquete | Uso | Estado |
|---------|-----|--------|
| `date-fns` | `formatDistanceToNow` en pipeline cards | A instalar |
| `recharts` | Performance charts | A instalar |
| `framer-motion` | AnimatePresence para collapse | Ya en design system |
| shadcn components | Todos los UI primitivos | Ya instalados |
| `@virus/shared/ai` | `generateIdeas()`, `hookRewriter()` | Ya construido (T2-P03) |
