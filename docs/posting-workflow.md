# Workflow de Posteo

Guía operativa para publicar contenido con Virus. 15 minutos el domingo, 5 minutos por día el resto de la semana.

---

## Workflow semanal

### DOMINGO — Setup de la semana (15 min)

```
1. Login en virus.vercel.app (o tu dominio)
2. Ir a /dashboard/calendar
3. Click en "Generar batch 7 días"
4. Esperar ~30 min (notificación cuando esté listo)
5. Revisar las 7 ideas generadas:
   - Las que te gustan → dejar como están (ya están en cola)
   - Las que no convencen → rechazar y regenerar (ver abajo)
6. Listo. Los 7 videos van a estar renderizando en background.
```

**¿Cuándo llega la notificación?**
El sistema envía una notificación en la app cuando todos los videos están en estado `ready`. También podés monitorear el progreso en `/dashboard/pipeline`.

---

### LUNES A SÁBADO — Posteo diario (5 min/día)

```
1. Notificación a las 8 AM: "Tu video del día está listo"
2. Login → /dashboard/pipeline
3. Click en "Descargar" en el video del día
4. Subir a:
   - Instagram Reels (obligatorio)
   - TikTok (recomendado)
   - YouTube Shorts (opcional)
5. Pegar el caption:
   - En /dashboard/pipeline, el caption se copia con un click
   - Viene adaptado para cada plataforma (Reels / TikTok / Shorts)
6. Marcar como publicado en el dashboard (click en "Publicado")
7. (Opcional) Cargar métricas a las 24h en /dashboard/performance
```

---

## Casos especiales

### Una idea no me convence

En `/dashboard/ideas` o `/dashboard/calendar`:

1. Click en "Rechazar" en la idea que no te gusta
2. Click en "Regenerar variante" (usa el engine viral para proponer otra)
3. Si la nueva tampoco convence → rechazar de vuelta, regenerar hasta encontrar una buena
4. También podés editar la idea manualmente antes de aprobarla

**Tip:** Si ninguna de las 7 ideas está buena, el problema probablemente está en el archivo `viral_patterns.md` del proyecto. Considerar actualizarlo con más hooks o formatos.

---

### La voz suena mal o robótica

**Causa más común:** El voice clone se "degrada" si ElevenLabs actualiza su modelo.

**Fix:**

1. Ir a `/dashboard/settings/voice`
2. Click en "Re-clonar voz"
3. Subir nuevamente el audio de muestra (el mismo de la primera vez está bien)
4. Esperar que ElevenLabs procese (~2 min)
5. El nuevo Voice ID se guarda automáticamente

**Si el problema persiste:** Probar cambiando la configuración de estabilidad/claridad en ElevenLabs. Valores recomendados: Stability 0.5, Similarity 0.75.

---

### Alguien me pide un video específico ("creá uno sobre X")

Para generar un video fuera del batch semanal:

1. Ir a `/dashboard` o directamente a `/dashboard/ideas`
2. Click en "Nueva idea manual"
3. Escribir el tema/hook específico
4. Aprobar → el pipeline arranca automáticamente
5. En ~10 minutos el video está listo en `/dashboard/pipeline`

---

### Quiero cambiar el orden de publicación de la semana

Los videos están en cola pero no tienen fecha fija asignada.

1. Ir a `/dashboard/calendar`
2. Drag & drop para cambiar el orden
3. El dashboard muestra qué video va cada día

---

### Quiero publicar dos veces en un día

1. Generar un video extra (ver "video específico" arriba)
2. O aprobar más de una idea en el batch semanal
3. No hay límite de videos por día — el límite es tu tiempo para postear

---

## Métricas y seguimiento

### Cargar métricas (recomendado)

Después de 24–48 horas del post:

1. Ir a `/dashboard/performance`
2. Seleccionar el video
3. Ingresar: views, likes, comments, shares, reach, plays (según la plataforma)
4. El dashboard calcula las 3 métricas clave:
   - **Engagement rate** = (likes + comments + shares) / reach × 100
   - **Completion rate** = plays / reach × 100 (solo Reels/TikTok)
   - **Share rate** = shares / views × 100

### ¿Qué hacer con los datos?

- Engagement bajo en un video → revisar el hook (primeros 3 segundos)
- Completion rate bajo → script muy largo o ritmo lento
- Share rate alto → ese formato funciona bien, repetir más seguido

Para análisis profundo, ver `proyecto.md §8 — Las 3 métricas clave`.

---

## Flujo completo en un vistazo

```
DOMINGO
  └─ /calendar → "Generar batch 7 días"
  └─ Revisar 7 ideas → rechazar/regenerar si hace falta
  └─ Listo (videos renderizando en background ~30 min)

LUNES–SÁBADO (cada día)
  └─ Notificación 8 AM
  └─ /pipeline → Descargar video del día
  └─ Subir a Instagram Reels (+ TikTok + Shorts)
  └─ Pegar caption (1 click)
  └─ Marcar como publicado
  └─ (24h después) Cargar métricas en /performance
```

---

## Atajos útiles

| Acción | Dónde |
|--------|-------|
| Ver todos los videos listos | `/dashboard/pipeline` → filtro "Ready" |
| Ver ideas pendientes de aprobar | `/dashboard/ideas` |
| Generar video manual | `/dashboard/ideas` → "Nueva idea manual" |
| Configurar voz | `/dashboard/settings/voice` |
| Ver rendimiento histórico | `/dashboard/performance` |
| Calendario semanal | `/dashboard/calendar` |
| Probar hooks (A/B) | `/dashboard/lab` |
