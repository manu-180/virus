---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/speed-build/
  - packages/remotion/src/components/screen-recording/
duracion-estimada: 60 min
---

# T3-P05 — Template "Speed Build" (30-60s, AI/vibe coding)

## Contexto

Speed build = "Construí X en N minutos/prompts" (proyecto.md hooks #6, #15, #30). Es uno de los formatos VIRAL más fuertes. Estructura:
- 0-2s: hook con resultado final ya visible ("Construí un Stripe checkout en 47 segundos")
- 2-5s: setup ("Usé Cursor + Claude Sonnet, cero código a mano")
- 5-50s: timelapse acelerado del proceso (prompts → código → resultado)
- 50-55s: reveal completo del producto funcionando
- 55-60s: CTA ("Comentá BUILD y te mando el prompt")

Lee:
- `proyecto.md` §1 (Speed build), §3 hooks #6 #15 #30
- `T3-P03` para estructura base.

## Tarea

Implementá `packages/remotion/src/templates/speed-build/` con la estructura estándar.

### Características visuales únicas

- **Timelapse simulado**: el componente `<ScreenRecording />` (NUEVO, en `components/screen-recording/`) renderiza una secuencia rápida de "frames de IDE" con código aparente. Como input recibe un array de "scenes" con código:
```tsx
interface ScreenRecordingProps {
  scenes: Array<{
    code: string;            // pegado en pantalla acelerado
    languageId: string;
    durationFrames: number;
    label?: string;          // ej. "Prompt 1"
  }>;
  themeColor: string;
}
```
- **Counter de tiempo** grande arriba: `00:01 → 00:47` corriendo en tiempo real (estilo speedrun).
- **Counter de prompts** abajo: "Prompt 1/3" con animación al cambiar.
- **Final reveal**: pantalla completa del "producto" terminado funcionando (un mock UI de checkout, dashboard, etc.). El input incluye una imagen final via `finalScreenshotUrl`.
- Música default: `phonk` o `synthwave` alta energía.
- Captions tipo `pop-word` para mantener rebote visual.

### Schema additional fields

Agregar al `videoInputSchema` (extends, no reemplaza) campos específicos:
```ts
export const speedBuildSchema = videoInputSchema.extend({
  speedBuild: z.object({
    elapsedTimeStartSec: z.number().default(0),
    elapsedTimeEndSec: z.number(),
    promptCount: z.number(),
    finalScreenshotUrl: z.string().url().optional(),
    scenes: z.array(z.object({
      code: z.string(),
      languageId: z.string(),
      label: z.string().optional(),
      durationFrames: z.number(),
    })),
  }),
});
```

### Sample data

Caso "Built a Stripe checkout in 47 seconds with vibe coding". Sample con 4-5 scenes de código realista (Next.js + Stripe).

## Output esperado

Template `speed-build` registrado y renderizable. Componente `<ScreenRecording />` reutilizable por otros templates.
