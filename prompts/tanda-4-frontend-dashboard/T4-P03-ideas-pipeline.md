---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T2-P03, T2-P07]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/ideas/
  - apps/web/src/app/(dashboard)/dashboard/pipeline/
  - apps/web/src/app/(dashboard)/dashboard/videos/[id]/
  - apps/web/src/app/api/ideas/generate/route.ts
  - apps/web/src/app/api/videos/[id]/approve/route.ts
duracion-estimada: 90 min
---

# T4-P03 — Pantallas Ideas + Pipeline + Detalle de video

## Contexto

3 pantallas core:
- `/ideas` — pool de ideas generadas, aprobar para que entren al pipeline.
- `/pipeline` — Kanban con videos en cada estado del pipeline.
- `/videos/[id]` — detalle de un video con todos sus assets, captions, descargas.

Lee:
- `prompts/00-ARCHITECTURE.md`
- API de Claude que ya construyó T2-P03 (ideas generator).

## Tarea

### 1. `/dashboard/ideas`

#### Server data
- Lista de `video_ideas` del user (`status = 'draft' | 'approved' | 'rejected'`).
- Filtros: por pillar, por status, por fecha.

#### UI
- Grid responsive (3 columnas desktop, 1 mobile) de cards.
- Cada card: hook (texto grande), pillar (badge color), formato sugerido, riskLevel, rationale (collapse).
- Acciones por card:
  - **Aprobar** → POST /api/videos (crea video en `status='scripting'` y dispara evento Inngest `virus/idea.approved`).
  - **Editar** (modificar hook/angle inline).
  - **Rechazar** (soft delete).
  - **Pedir variantes** → POST /api/ideas/rewrite (T2-P03 hook-rewriter).

- Botón hero arriba: **"Generar 5 ideas nuevas"** → modal con selector de pillar → POST /api/ideas/generate.

#### Estado
- Optimistic UI: aprobar tilda al instante, request en bg.
- Toast feedback en éxito/error.

### 2. `/dashboard/pipeline` (Kanban)

Columnas:
| pending | scripting | audio | rendering | ready | published |

Cada video es una card draggable (drag & drop opcional, igual mejor automático: el status lo cambia el worker).

Card del Kanban:
- Hook truncado.
- Template asignada.
- Tiempo en estado actual ("hace 12 min").
- Estado con micro-animación (bouncy si processing).

Realtime: Supabase channel actualiza columnas sin refrescar.

### 3. `/dashboard/videos/[id]`

Detalle completo:
- **Header**: hook + estado + acciones (Re-render, Eliminar).
- **Tabs**:
  - **Vista previa**: video player embebido (signed URL) + thumbnail.
  - **Script**: el JSON segmentado en formato leíble con timestamps.
  - **Captions**: words + lines exportables (SRT, VTT) por si quiere subirlas a IG manualmente.
  - **Audio**: player del MP3.
  - **Descripciones**: 3 cards (Instagram, TikTok, Shorts) con caption + hashtags + botón "Copiar" grande.
  - **Performance**: gráficos de views/likes/comments por plataforma (lleno cuando exista data).

#### Botón "Descargar" prominente
Descarga el MP4 directo. Estado disabled si `status !== 'ready' && status !== 'published'`.

#### Botón "Marcar como publicado"
Manuel hace click después de subirlo a IG → guarda timestamp y libera el slot del calendario.

### 4. API routes

`POST /api/ideas/generate`:
```ts
// Body: { pillar: 'educational', count: 5 }
// Auth: server client check user
// Llama al idea-generator de T2-P03
// Inserta 5 rows en video_ideas
// Devuelve las ideas
```

`POST /api/videos` (aprobar idea):
```ts
// Body: { ideaId }
// Crea video en pending, link al idea
// Envía evento Inngest virus/idea.approved con { videoId, userId }
// Devuelve videoId
```

`POST /api/videos/[id]/approve`, `POST /api/videos/[id]/reject`, `POST /api/videos/[id]/rerender`.

## Reglas

- Validar inputs con Zod en cada API route.
- Errores claros: cuando un render falla, el card en /pipeline muestra el error y el botón "Re-render".
- Estados intermedios animados (la espera es larga; UX que entretenga).

## Output esperado

3 pantallas funcionales que cubren el flujo "idea → aprobada → renderizada → lista para descargar/publicar".
