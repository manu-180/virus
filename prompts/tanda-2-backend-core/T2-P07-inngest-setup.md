---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: [T2-P01]
file-ownership:
  - apps/worker/src/
  - apps/worker/src/index.ts
  - apps/worker/src/inngest.ts
  - apps/worker/src/functions/
  - apps/worker/src/functions/index.ts
  - apps/web/src/app/api/inngest/route.ts
  - apps/web/src/lib/inngest.ts
duracion-estimada: 45 min
---

# T2-P07 — Inngest setup (job queue para el pipeline de video)

## Contexto

Inngest es la cola de trabajos que orquesta el pipeline:
```
generate-script → synthesize-audio → transcribe → render-video → upload-storage → notify-ready
```

Cada paso es **durable, retryable, observable** y puede correr horas después si hace falta.

Lee:
- `prompts/00-ARCHITECTURE.md`
- https://www.inngest.com/docs/quick-start

## Tarea

### 1. Cliente Inngest (`apps/web/src/lib/inngest.ts`)

```ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'virus',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Eventos del sistema (typed)
export type Events = {
  'virus/idea.approved':     { data: { videoId: string; userId: string } };
  'virus/script.generated':  { data: { videoId: string } };
  'virus/audio.synthesized': { data: { videoId: string; audioPath: string } };
  'virus/captions.ready':    { data: { videoId: string } };
  'virus/render.requested':  { data: { videoId: string } };
  'virus/render.completed':  { data: { videoId: string; videoUrl: string } };
  'virus/render.failed':     { data: { videoId: string; error: string } };
  'virus/caption.generated': { data: { videoId: string } };
};
```

### 2. Endpoint Inngest en Next.js (`/api/inngest/route.ts`)

```ts
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest';
import { functions } from '@virus/worker/functions';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
```

### 3. Worker app (`apps/worker/`)

Por ahora dejá los **stubs** de las 6 funciones. La lógica real la implementa T5-P02 (orchestrator).

```ts
// apps/worker/src/inngest.ts
export { inngest } from '@virus/web/lib/inngest';   // reusa el cliente
```

```ts
// apps/worker/src/functions/index.ts
import { inngest } from '../inngest';

export const generateScript = inngest.createFunction(
  { id: 'generate-script', concurrency: 5 },
  { event: 'virus/idea.approved' },
  async ({ event, step }) => {
    // T5-P02 implementa
    return { videoId: event.data.videoId };
  },
);

export const synthesizeAudio = inngest.createFunction(
  { id: 'synthesize-audio', concurrency: 3, retries: 3 },
  { event: 'virus/script.generated' },
  async ({ event, step }) => {
    return { videoId: event.data.videoId };
  },
);

export const transcribeAudio = inngest.createFunction(
  { id: 'transcribe-audio', concurrency: 5, retries: 3 },
  { event: 'virus/audio.synthesized' },
  async ({ event, step }) => {
    return { videoId: event.data.videoId };
  },
);

export const renderVideo = inngest.createFunction(
  { id: 'render-video', concurrency: 5, retries: 2, throttle: { limit: 10, period: '1m' } },
  { event: 'virus/render.requested' },
  async ({ event, step }) => {
    return { videoId: event.data.videoId };
  },
);

export const generateCaption = inngest.createFunction(
  { id: 'generate-caption', concurrency: 5 },
  { event: 'virus/render.completed' },
  async ({ event, step }) => {
    return { videoId: event.data.videoId };
  },
);

export const handleFailure = inngest.createFunction(
  { id: 'handle-failure' },
  { event: 'virus/render.failed' },
  async ({ event, step }) => {
    return { videoId: event.data.videoId };
  },
);

export const functions = [
  generateScript, synthesizeAudio, transcribeAudio,
  renderVideo, generateCaption, handleFailure,
];
```

### 4. Dev script

`apps/worker/package.json`:
```json
{
  "scripts": {
    "dev": "inngest-cli dev"
  }
}
```

Y agregar al README de root:
```bash
# Terminal 1: app
pnpm dev
# Terminal 2: inngest dev server
pnpm --filter @virus/worker dev
```

### 5. Helper para disparar eventos

`apps/web/src/lib/inngest-events.ts`:
```ts
import { inngest } from './inngest';
import type { Events } from './inngest';

export async function send<K extends keyof Events>(name: K, data: Events[K]['data']) {
  return inngest.send({ name, data });
}
```

Para que server actions hagan:
```ts
await send('virus/idea.approved', { videoId, userId });
```

## Reglas

- Cada función con `retries` apropiado (network calls = 3, llamadas a Claude = 2).
- `concurrency` ajustado: render no debe pegarle más de 5 simultáneos a Lambda.
- Throttle en `render-video` para no excederse de límites AWS.
- Logging mínimo en cada step (`step.run('log', ...)`)

## Output esperado

Inngest setup completo. Las funciones son stubs pero el wiring funciona: enviar un evento debe disparar la función y retornar OK en el dashboard de Inngest dev.

## Verificación

```bash
pnpm dev                                   # Next en :3000
pnpm --filter @virus/worker dev           # Inngest en :8288
# Visitar http://localhost:8288 → debe aparecer la app "virus" con 6 functions
# En el "Send events" tab: enviar `virus/idea.approved` con `{ videoId: 'test', userId: 'test' }`
# La función generateScript debe correr y devolver { videoId: 'test' }
```
