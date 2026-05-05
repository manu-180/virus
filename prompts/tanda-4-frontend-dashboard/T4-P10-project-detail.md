---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T2-P08, T5-P05]
file-ownership:
  - apps/web/src/app/(dashboard)/projects/[slug]/page.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/header.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/generate-button.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/generation-progress.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/video-history.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/files-panel.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/anti-repeat-summary.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/video-row.tsx
  - apps/web/src/app/(dashboard)/projects/[slug]/_components/caption-modal.tsx
duracion-estimada: 90 min
---

# T4-P10 — Project Detail (la pantalla del botón "Generar video")

## Contexto

Esta es **la pantalla principal del trabajo diario de Manuel**: entra a `/projects/[slug]`, ve el estado del proyecto, clickea "Generar video", espera 2-4 minutos, descarga el MP4 y copia el caption.

Lee primero:
- `apps/web/src/server/projects/queries.ts` (T2-P08) — `fetchProjectFull()`.
- `apps/web/src/server/generate/` (T5-P05) — endpoint `triggerGeneration()`.
- `apps/web/src/lib/realtime/` (T2-P01).

## Tarea

### Layout vertical

#### Header

```
┌─────────────────────────────────────────────────────┐
│ ● APEX — Servicios de software        [Configurar]  │
│   nicho: dev/software · 12 videos · ROAS prom 3.2x  │
└─────────────────────────────────────────────────────┘
```

Dot color = `theme_color`. "Configurar" → modal con tabs (Basics / Patterns / Brand / Voz / Eliminar).

#### Generate button (HERO, gigante)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              🎬  GENERAR VIDEO                      │
│                                                     │
│   Click → idea + script + audio + render           │
│   ⏱ ~3 min · próxima generación libre              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Disabled si:
- `parse_status` de patterns o brand ≠ 'ok' → muestra "⚠ Configurá tus archivos primero" y link a config.
- Hay otra generación en curso para este proyecto → muestra "⏳ Generando ahora..." con `<GenerationProgress>`.
- Rate limit alcanzado → muestra "Esperá X min".

Al click:
1. POST a `/api/generate` con `{ projectId }`.
2. Switchea a estado "in-progress" mostrando `<GenerationProgress>`.
3. Subscribe a `project:{slug}` realtime channel.

URL param `?autogenerate=1` → click programático del botón al montar (viene del wizard).

#### Generation Progress (cuando está corriendo)

Lista de pasos con estado en vivo:
```
✓ Idea generada            (hook: "Tu MVP no necesita Auth0...")
✓ Script escrito           (38 segmentos, 24s estimados)
⟳ Audio sintetizando...    
⏳ Captions
⏳ Renderizando video
⏳ Caption Instagram
```

Steps vienen del schema `videos.status` + `job_events` table. Re-render con cada tick de Realtime.

Cuando llega a `ready`: animación de éxito, scroll a la nueva fila en el historial.

#### Video History

Tabla / lista de videos generados (más reciente arriba):

```
┌──────────┬──────────────────────┬──────┬─────────┬──────────┬───────────┐
│ Estado   │ Hook                 │ Form.│ Duración│ Creado   │ Acciones  │
├──────────┼──────────────────────┼──────┼─────────┼──────────┼───────────┤
│ 🟢 Listo │ Tu MVP no necesita...│ tip  │ 24s     │ hace 1m  │ ↓ MP4 📋📤│
│ 🟡 Render│ Hice un chatbot en...│ build│ 28s     │ hace 5m  │ —         │
│ 🟢 Listo │ Las apps Flutter son │ rant │ 22s     │ hace 1h  │ ↓ MP4 📋📤│
└──────────┴──────────────────────┴──────┴─────────┴──────────┴───────────┘
```

Acciones por fila:
- ↓ "Descargar MP4" → signed URL.
- 📋 "Copiar caption" → abre `<CaptionModal>` con tabs Instagram/TikTok/Shorts. Click "Copiar" copia al clipboard + toast.
- 📤 "Marcar publicado" → modal donde el user pega URL del post → guarda `published_at` + URL.

Click en fila → modal con preview del video, transcripción, captions, performance (si la tiene).

#### Files Panel (sidebar derecho colapsable)

```
ARCHIVOS DEL PROYECTO
🧬 viral_patterns        v3 · 🟢 OK · hace 2d   [↻ Re-subir]
🏷️ project_info          v1 · 🟢 OK · hace 5d   [↻ Re-subir]
   [+ Subir nueva versión]
```

Re-subir abre el componente de upload de T4-P09 (drag&drop) en modal. Al subir nueva versión, el badge va a "🟡 Parseando...".

#### Anti-Repeat Summary (info opcional, expandible)

```
EVITANDO REPETIR (últimos 14 días)
8 hooks usados · 5 topics · 3 ángulos
[ver detalle]
```

"Ver detalle" abre modal con la lista de signatures recientes (hash visible + texto del hook).

### Layout responsive

- Desktop: 2 columnas (main 70%, files panel 30%).
- Tablet: 1 columna, files panel se vuelve sección abajo.
- Mobile: 1 columna sticky con generate button arriba, historial debajo.

## Reglas

- **Loading**: Suspense con skeletons; el botón "Generar" siempre se renderiza primero (CLS mínimo).
- **Realtime**: una sola subscripción al channel `project:{slug}` con switch por evento.
- **Optimistic UI**: al click de "Generar" el botón cambia inmediatamente sin esperar response.
- **Errores**: si la generación falla, fila va a 🔴 con tooltip del error + botón "Reintentar" que re-encola.
- **Animaciones**: Framer Motion para entrada de filas nuevas (slide-in desde top).

## Qué NO hagas

- NO toques el orchestrator (eso es T5-P05).
- NO escribas el rate limiter (T5-P04 ya lo tiene).
- NO toques files upload backend (T2-P08).

## Output esperado

Pantalla productiva: un click genera un video, el progreso se ve en vivo, al terminar se descarga MP4 + se copia caption + se marca publicado. Si configurar archivos pendiente, está claro qué hacer.

## Verificación

E2E manual: entrar a `/projects/apex-dev` con archivos parseados → click "Generar" → ver progreso → tras ~3 min ver fila nueva 🟢 → descargar MP4 (no falla) → copiar caption Instagram → marcar publicado pegando URL.
