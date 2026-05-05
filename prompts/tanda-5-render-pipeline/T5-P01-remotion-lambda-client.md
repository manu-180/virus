---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 5
depende-de: [T1-P06, T3-P01]
file-ownership:
  - packages/shared/src/render/
  - packages/shared/src/render/lambda-client.ts
  - packages/shared/src/render/types.ts
  - packages/shared/src/render/index.ts
duracion-estimada: 45 min
---

# T5-P01 — Cliente de Remotion Lambda (renderizar videos en AWS)

## Contexto

Wrapper sobre `@remotion/lambda/client` para invocar renders desde el worker.

Lee:
- `prompts/00-ARCHITECTURE.md`
- https://www.remotion.dev/docs/lambda/api

## Tarea

### 1. `lambda-client.ts`

```ts
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';

export interface RenderOptions {
  composition: 'tip' | 'hot-take' | 'speed-build' | 'listicle' | 'story' | 'comparison';
  inputProps: VideoInput;        // del schema de T3-P01
  outName?: string;              // S3 key
}

export async function startRender(opts: RenderOptions): Promise<{
  renderId: string;
  bucketName: string;
}>;

export async function pollRender(input: { renderId: string; bucketName: string }): Promise<{
  done: boolean;
  outputFile?: string;           // URL S3
  errors?: string[];
  overallProgress: number;       // 0-1
}>;

export async function downloadRender(input: { renderId: string; bucketName: string; localPath: string }): Promise<void>;
```

Implementación:
- `renderMediaOnLambda` con `region: process.env.AWS_REGION`, `functionName: process.env.REMOTION_LAMBDA_FUNCTION_NAME`, `serveUrl: process.env.REMOTION_SERVE_URL`, `composition: opts.composition`, `inputProps: opts.inputProps`, `codec: 'h264'`, `imageFormat: 'jpeg'`, `crf: 18`, `audioBitrate: '192k'`, `pixelFormat: 'yuv420p'`.
- `getRenderProgress` con polling.
- Cuando `done: true && outputFile`: descargar de S3 a `localPath`.
- Errores: capturar y devolver con `errors[]`.

### 2. Validación

Antes de invocar Lambda, validar `inputProps` contra el schema de T3-P01 (`videoInputSchema`). Si falla, devolver error sin gastar dinero en Lambda.

### 3. Telemetría

Loguear:
- Tiempo total del render (start → done).
- Costo estimado: `(durationSec * memorySizeGB) * AWS_LAMBDA_PRICE_PER_GB_SEC`.
- Tamaño del output.

### 4. Helper de costo

```ts
export function estimateRenderCost(durationSec: number): number;
// Returns USD estimate
```

## Output esperado

Cliente listo para usar desde el orchestrator (T5-P02). Probado con un render real una vez que T3 tenga al menos un template con sample.json.

## Verificación

Script CLI:
```bash
pnpm tsx packages/shared/scripts/try-render.ts
# Inputs: composition + sample.json
# Output: log de progreso, URL S3 final
```
