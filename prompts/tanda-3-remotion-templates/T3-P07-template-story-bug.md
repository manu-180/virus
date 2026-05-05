---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/story/
duracion-estimada: 60 min
---

# T3-P07 — Template "Story / Bug Horror" (30-60s)

## Contexto

Storytelling de un bug, outage, o experiencia (proyecto.md hooks #8, #24, #27). Formato más narrativo, menor densidad de cortes, más voz humana.
- 0-3s: hook grave ("Un caracter rompió producción durante 4 horas. Yo era el responsable.")
- 3-12s: setup del incidente (fecha, contexto, equipo)
- 12-40s: desarrollo en arco (qué pasó, cómo lo descubriste, qué intentaste)
- 40-50s: resolución
- 50-60s: lección + CTA

## Tarea

Implementá `packages/remotion/src/templates/story/` con estructura estándar.

### Características visuales

- **Tono más cinemático**: música default `cinematic` o `lofi` baja energía. Pacing 1.0× (no acelerar audio tanto, narrativa importa).
- **Timeline visual** abajo: una barra horizontal con marcadores de eventos (`13:42 - error reportado`, `14:15 - escalado a senior`, etc.).
- **Stack trace / log lines** que aparecen una por una en monospace mientras se cuenta la historia.
- **Cards con quotes/Slack messages** simulados: "Senior dev: 'Quién hizo este commit?'".
- **Pattern interrupt MENOR** que en hot-take: cortes cada 4-6s, no cada 2-3s.
- **Reveal del bug** en momento alto: code diff con la línea ofensora highlighteada en rojo + sound effect de "gasp" o "alert".
- Captions en estilo `wipe-line` (más cinemática).

### Schema additional

```ts
export const storySchema = videoInputSchema.extend({
  story: z.object({
    timelineEvents: z.array(z.object({
      time: z.string(),         // "13:42"
      label: z.string(),
    })),
    bugReveal: z.object({
      beforeCode: z.string(),
      afterCode: z.string(),
      language: z.string(),
      offendingLine: z.number(),
    }),
    chatMessages: z.array(z.object({
      author: z.string(),
      text: z.string(),
      atSec: z.number(),
    })).optional(),
  }),
});
```

### Sample data

Bug horror real-style: "Un `==` en lugar de `===` en validación de auth permitió bypass durante 3 días".

## Output esperado

Template `story` registrado y renderizable. Tono cinemático evidente vs. los otros templates más rápidos.
