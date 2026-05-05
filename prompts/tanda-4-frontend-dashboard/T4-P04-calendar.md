---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/calendar/
  - apps/web/src/app/api/videos/[id]/schedule/route.ts
  - apps/web/src/app/api/scheduler/batch/route.ts
duracion-estimada: 60 min
---

# T4-P04 — Calendar / Scheduler

## Contexto

Manuel necesita **agendar publicaciones** y ver de un vistazo qué se publica cuándo. Frecuencia recomendada (de proyecto.md): **1 video/día durante 30-45 días, después 5 videos/semana**.

## Tarea

### 1. `/dashboard/calendar`

Vista de calendario mensual con:
- Cada día con dot/badge del video programado (color = themeColor del video).
- Click en día con video → drawer con detalle.
- Click en día vacío → modal "Programar video" con selector de:
  - Idea o video existente del pool de "ready".
  - Hora del día (default 9:00 AM o 6:00 PM, los slots con mejor performance — en el futuro inferido de analytics).
  - Plataformas a publicar (Instagram default, opcional TikTok/Shorts).

### 2. Vista alternativa "lista"

Toggle en topbar para alternar mes / lista cronológica. La lista muestra próximos 30 días con cards por video.

### 3. Botón "Generar batch de 7 días"

Acción mágica: en un click, Manuel genera ideas, scripts, audios y renders para los próximos 7 días.

```ts
POST /api/scheduler/batch
{ days: 7, startDate: '2026-05-15', pillarMix: { educational: 0.6, hot_take: 0.3, personal: 0.1 } }
```

Endpoint:
1. Genera 7 ideas respetando pillar mix.
2. Crea 7 videos en `pending`.
3. Programa fechas de publicación (1/día).
4. Dispara 7 eventos Inngest `virus/idea.approved` con delays escalonados (no todos al mismo tiempo para no saturar Lambda).

UI: durante el batch, mostrar progress en realtime (7/7 videos). Si alguno falla, log claro.

### 4. Reglas del scheduler

- No agendar 2 videos en el mismo día.
- No agendar antes de que el video esté en `ready` (warning si user agenda algo en `pending`).
- Configuración del usuario en /settings/schedule:
  - Frecuencia por defecto (1/día, 1/2 días, 1/3 días).
  - Hora preferida.
  - Días sin posteo (ej. domingos off).

### 5. Notificaciones

Cuando un video programado está a 1h de su fecha → notificación en topbar "Tu video '...' está listo para publicar". (Realtime channel.)

## Output esperado

Calendario funcional + botón mágico de generación batch + scheduler inteligente que respeta reglas.
