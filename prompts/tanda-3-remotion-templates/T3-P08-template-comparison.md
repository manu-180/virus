---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/comparison/
duracion-estimada: 45 min
---

# T3-P08 — Template "Comparison Side-by-Side" (30-45s)

## Contexto

Comparativa de 2 herramientas/frameworks/aproximaciones (proyecto.md "Comparison side-by-side", hooks #2, #5). Estructura:
- 0-2s: hook ("Cursor vs Claude Code. ¿Cuál es mejor?")
- 2-6s: setup (criterios)
- 6-35s: 3-5 rounds de comparación (split screen, tool A vs tool B, ganador por round)
- 35-40s: total final ("Tool A: 3 - Tool B: 2 → Ganador: Tool A")
- 40-45s: CTA polémica

## Tarea

Implementá `packages/remotion/src/templates/comparison/` con estructura estándar.

### Características visuales

- **Split screen vertical 50/50** durante toda la fase de comparación. Lado izquierdo Tool A, derecho Tool B.
- **Encabezado fijo** con logos/nombres + score acumulado (`Cursor 2 - Copilot 1`).
- **Cada round dura 5-7s**: muestra tarea idéntica en ambos lados, marca el ganador con flash verde y check, el perdedor con flash rojo y X.
- **Sound effects**: ding al ganador, buzzer al perdedor.
- **Reveal final**: pantalla completa con score grande + ganador en color accent.
- Captions style `highlight-word`.
- Música: `synthwave` (energía media-alta).

### Schema additional

```ts
export const comparisonSchema = videoInputSchema.extend({
  comparison: z.object({
    toolA: z.object({ name: z.string(), logoUrl: z.string().url().optional(), color: z.string() }),
    toolB: z.object({ name: z.string(), logoUrl: z.string().url().optional(), color: z.string() }),
    rounds: z.array(z.object({
      title: z.string(),
      taskDescription: z.string(),
      toolAResult: z.string(),
      toolBResult: z.string(),
      winner: z.enum(['A', 'B', 'tie']),
    })),
    finalScore: z.object({ a: z.number(), b: z.number() }),
    overallWinner: z.enum(['A', 'B', 'tie']),
  }),
});
```

### Sample data

Cursor vs Claude Code en 4 rounds: refactor, debug, generación de tests, integración con MCP.

## Output esperado

Template `comparison` registrado y renderizable. Split screen funciona correctamente, scores se actualizan animados.
