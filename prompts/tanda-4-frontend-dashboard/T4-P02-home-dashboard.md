---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T2-P01]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/page.tsx
  - apps/web/src/app/(dashboard)/dashboard/_components/
  - apps/web/src/app/(dashboard)/dashboard/_components/stats-grid.tsx
  - apps/web/src/app/(dashboard)/dashboard/_components/active-pipeline.tsx
  - apps/web/src/app/(dashboard)/dashboard/_components/quick-actions.tsx
  - apps/web/src/app/(dashboard)/dashboard/_components/recent-videos.tsx
  - apps/web/src/app/(dashboard)/dashboard/_components/upcoming-schedule.tsx
duracion-estimada: 60 min
---

# T4-P02 — Home dashboard (overview)

## Contexto

Pantalla principal donde Manuel aterriza después del login. Tiene que dar **estado en una mirada** de todo el sistema.

## Tarea

Layout vertical con secciones:

### 1. Hero / saludo
"Buen día, Manuel. Tenés **3 videos en cola** y el próximo se publica **mañana 9:00 AM**."

Si no hay videos pendientes: "Listos para arrancar el día. Generá ideas nuevas."

### 2. Stats grid (4 KPIs)

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  En cola    │ Esta semana │  Vistas tot │ Engagement  │
│     3       │      5      │   12.4K     │   3.2% ↑    │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

Cards con número grande, label, y trend (↑/↓ vs semana anterior cuando haya data).

### 3. Active pipeline

Lista de los videos que están **en proceso ahora mismo** (status `scripting | audio | rendering | ready`).
Cada item:
- Título / hook (truncado).
- Status con icono animado (loading spinner si processing, check si ready).
- Progress bar por status.
- "Ver detalle" link.

Realtime: usar Supabase Realtime channel para actualizar status sin refrescar.

### 4. Quick actions (4 cards)

Grid 2×2 con CTAs grandes:
- 💡 **Generar 5 ideas nuevas** (action button)
- ✏️ **Crear video desde cero** (formulario libre)
- 📅 **Programar batch de 7 días** (genera ideas+scripts+renders en lote)
- 🎤 **Re-clonar mi voz** (link a /settings/voice)

### 5. Recent videos (últimos 5 publicados)

Carrusel horizontal de thumbnails con:
- Thumbnail (frame del video).
- Título corto.
- Plataforma publicada.
- Stats (vistas, likes).
- Click → modal con preview + caption + analytics.

### 6. Upcoming schedule (próximos 7 días)

Mini calendario con dots de colores indicando videos programados por día. Click en día → /calendar.

## Datos

Las queries van vía server components con `createClient()` del server (T2-P01).
La pieza realtime (active pipeline) es client component que usa el browser client.

Si la base está vacía (estado inicial), mostrá empty states bien diseñados con CTA claro.

## Reglas

- Loading states con `<Suspense>` y skeleton dedicado.
- Cero "data fetcheada en client si puede ir en server".
- Animaciones sutiles de entrada (stagger por sección, 80ms delay).

## Output esperado

Dashboard home premium, informativo, accionable.
