---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: docs-architect
tanda: 7
depende-de: [todas]
file-ownership:
  - README.md
  - docs/
  - docs/runbook.md
  - docs/architecture-overview.md
  - docs/getting-started.md
  - docs/contributing.md
  - docs/troubleshooting.md
  - docs/posting-workflow.md
duracion-estimada: 60 min
---

# T7-P04 — Documentación + Runbook + Posting workflow

## Contexto

Cierre del proyecto. Todo documentado para que Manuel pueda operar sin tener que recordar cada decisión.

## Tarea

### 1. `README.md` (root)

- Hero: nombre + 1-line pitch.
- Demo gif corto (placeholder).
- Stack badges.
- Quick start: 5 comandos.
- Link a `docs/`.

### 2. `docs/getting-started.md`

Para Manuel cuando pase tiempo y vuelva:
- Cómo levantar el proyecto local.
- Cómo correr el primer video end-to-end.
- Cómo hacer el voice clone si todavía no.

### 3. `docs/architecture-overview.md`

Resumen high-level:
- Diagrama mermaid del flow.
- Cada paquete y qué hace.
- Decisiones técnicas clave (linkeando a `prompts/00-ARCHITECTURE.md`).

### 4. `docs/posting-workflow.md` (CRÍTICO)

Workflow operativo de Manuel para postear:

```
DOMINGO (15 min):
1. Login en Virus.
2. Click "Generar batch 7 días" en Calendar.
3. Esperar ~30 min (notificación cuando esté ready).
4. Revisar las 7 ideas, descartar las que no convencen, regenerar variantes con Lab.
5. Listo.

LUNES A SÁBADO (5 min/día):
1. Notificación a las 8 AM: "Tu video del día está listo".
2. Login → /pipeline → click "Descargar" en el video del día.
3. Subir a Instagram Reels (también TikTok y Shorts si querés).
4. Pegar caption (un click, copia automática).
5. Marcar como publicado en el dashboard.
6. (Opcional) Cargar métricas a las 24h o 48h.
```

Cubrir también:
- Qué hacer si una idea no me gusta (rechazar, regenerar).
- Qué hacer si la voz suena mal (re-clonar).
- Qué hacer si me piden un video específico ("creá uno sobre X") → /dashboard manual.

### 5. `docs/runbook.md`

Operaciones de incidentes:
- Render falla → re-trigger desde /pipeline.
- ElevenLabs quota exceeded → ver /settings/billing.
- Anthropic API down → comportamiento del sistema (skip y retry).
- DB lleno → cómo hacer cleanup (audios viejos > 30 días).
- Lambda quota exceeded → cómo pedir aumento.

### 6. `docs/troubleshooting.md`

FAQ de problemas comunes (con basis en el research):
- "El video se ve mal en mobile" → safe zones.
- "La voz suena robótica" → settings/voice.
- "Captions desincronizadas" → re-trigger transcribe.
- "Engagement bajo" → leer `proyecto.md` §8 (las 3 métricas).

### 7. `docs/contributing.md`

Si Manuel un día abre el repo:
- Cómo agregar un nuevo template.
- Cómo agregar un nuevo prompt de Claude.
- Convenciones de commit (Conventional Commits).
- Cómo correr migrations en dev.

## Output esperado

Documentación completa. Manuel puede pausar el proyecto 6 meses, volver, y arrancar sin perderse.
