---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 5
depende-de: [T2-P01]
file-ownership:
  - apps/web/src/lib/realtime/
  - apps/web/src/lib/realtime/use-video-status.ts
  - apps/web/src/lib/realtime/use-pipeline-status.ts
  - apps/web/src/lib/realtime/types.ts
duracion-estimada: 30 min
---

# T5-P03 — Realtime channels (frontend hooks)

## Contexto

Cada update en `videos` y `job_events` debe propagarse al frontend en tiempo real (sin polling).

## Tarea

### 1. `useVideoStatus(videoId)`

```ts
export function useVideoStatus(videoId: string): {
  video: VideoRow | null;
  loading: boolean;
  error: Error | null;
};
```

- Subscribe al row específico vía postgres_changes filter.
- Devuelve el video reactivo.
- Cleanup del channel en unmount.

### 2. `usePipelineStatus(userId)`

```ts
export function usePipelineStatus(userId: string): {
  videos: VideoRow[];
  loading: boolean;
};
```

- Subscribe a todos los videos del user.
- Útil en /pipeline (Kanban en vivo).

### 3. `useJobEvents(videoId)`

Stream de los `job_events` del video (para mostrar el log de pasos en /videos/[id]).

## Reglas

- Hooks SOLO en client components (`'use client'`).
- Type-safe con types de `@virus/db`.
- Reconexión automática si el channel se cae.

## Output esperado

Hooks listos para que T4 los consuma. /pipeline muestra videos cambiando estado sin refrescar.
