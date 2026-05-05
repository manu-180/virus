---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: frontend-developer
tanda: 3
depende-de: [T1-P01, T1-P03]
file-ownership:
  - packages/remotion/src/index.ts
  - packages/remotion/src/Root.tsx
  - packages/remotion/remotion.config.ts
  - packages/remotion/tsconfig.json
  - packages/remotion/src/lib/
  - packages/remotion/src/lib/types.ts
  - packages/remotion/src/lib/audio-loader.ts
  - packages/remotion/src/lib/use-tokens.ts
  - packages/remotion/src/lib/safe-zones.tsx
duracion-estimada: 60 min
---

# T3-P01 — Setup base de Remotion + tipos compartidos + utilidades

## Por qué Opus 4.7

El diseño base de los componentes de video y los contracts de input afecta a las 6 templates que vienen después. Hacelo bien una vez para que los demás agentes no choquen.

## Contexto

Remotion permite definir videos como componentes React. Cada video se renderiza vía `npx remotion render` o vía Lambda. La estructura mínima:

```
packages/remotion/
├── src/
│   ├── index.ts              ← entry point para Lambda
│   ├── Root.tsx              ← registra todas las compositions
│   ├── templates/            ← una carpeta por template (T3-P02..P07)
│   ├── components/           ← shared (Captions, CodeBlock, Counter)
│   └── lib/                  ← types, hooks, utilidades
├── remotion.config.ts
└── package.json
```

Lee:
- `prompts/00-DESIGN-TOKENS.md`
- `proyecto.md` §1 (specs técnicas obligatorias) y §2 (anatomía)

## Tarea

### 1. `remotion.config.ts`

Configurar:
- `Config.setVideoImageFormat('jpeg')`
- `Config.setOverwriteOutput(true)`
- `Config.setConcurrency(1)` (para Lambda)
- `Config.setPixelFormat('yuv420p')` (compatibilidad universal)
- `Config.setCodec('h264')`
- `Config.setCrf(18)` (alta calidad)
- `Config.setAudioBitrate('192k')`
- Dimensiones default 1080×1920 (las compositions las setean también).

### 2. `Root.tsx`

```tsx
import { Composition } from 'remotion';
import { TipTemplate, tipSchema, tipDefaults } from './templates/tip';
import { HotTakeTemplate, hotTakeSchema, hotTakeDefaults } from './templates/hot-take';
// ... importar las 6 templates

export const VirusRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="tip"
        component={TipTemplate}
        durationInFrames={30 * 30}    // será sobrescrito por inputProps.durationFrames
        fps={30}
        width={1080}
        height={1920}
        schema={tipSchema}
        defaultProps={tipDefaults}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil(props.totalDurationSec * 30),
        })}
      />
      {/* ... 5 más */}
    </>
  );
};
```

### 3. `index.ts`

```ts
import { registerRoot } from 'remotion';
import { VirusRoot } from './Root';
registerRoot(VirusRoot);
```

### 4. Tipos compartidos (`lib/types.ts`)

```ts
import { z } from 'zod';

// Schema único para TODOS los templates (lo que llega del orchestrator)
export const videoInputSchema = z.object({
  totalDurationSec: z.number().min(8).max(180),
  themeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  language: z.enum(['es', 'en']),
  audioUrl: z.string().url(),
  musicMood: z.enum(['lofi', 'synthwave', 'phonk', 'cinematic']).optional(),
  segments: z.array(
    z.object({
      index: z.number(),
      role: z.enum(['hook', 'setup', 'development', 'mini_payoff', 'reveal', 'cta']),
      startSec: z.number(),
      endSec: z.number(),
      voiceover: z.string(),
      onScreenText: z.string().optional(),
      visualCue: z.string(),
      codeSnippet: z.object({
        language: z.string(),
        code: z.string(),
      }).optional(),
      soundEffect: z.enum(['whoosh','click','ding','glitch','pop']).nullable().optional(),
    })
  ),
  captions: z.object({
    words: z.array(z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
    })),
  }),
  brand: z.object({
    handle: z.string(),
    logoUrl: z.string().url().optional(),
  }),
});

export type VideoInput = z.infer<typeof videoInputSchema>;
```

### 5. Hook `useTokens()` (`lib/use-tokens.ts`)

```ts
import { colors, fonts, video } from '@virus/shared/tokens';

export function useTokens(themeColor?: string) {
  return {
    ...colors,
    accent: themeColor ?? colors.accent,
    fonts,
    video,
  };
}
```

### 6. Componente `<SafeZones />` (`lib/safe-zones.tsx`)

Renderiza overlays semitransparentes en las zonas tapadas por UI de cada plataforma. Solo en preview/dev:

```tsx
export const SafeZones: React.FC<{ enabled?: boolean }> = ({ enabled = false }) => {
  if (!enabled) return null;
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 250, background: 'rgba(255,0,0,0.1)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 350, background: 'rgba(255,0,0,0.1)' }} />
    </>
  );
};
```

Ningún elemento crítico (caption, hook text) puede caer en estas zonas. Las templates deben respetarlo.

### 7. Audio loader (`lib/audio-loader.ts`)

```tsx
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const VoiceoverAudio: React.FC<{ url: string }> = ({ url }) => (
  <Audio src={url} />
);

export const BackgroundMusic: React.FC<{ mood: string; volume?: number }> = ({ mood, volume = 0.2 }) => (
  <Audio src={staticFile(`/music/${mood}.mp3`)} volume={volume} />
);
```

Las pistas de música van en `packages/remotion/public/music/` — placeholders por ahora; T7 final agrega audios reales (Manuel los descarga de Epidemic Sound o YouTube Audio Library).

### 8. README en `packages/remotion/`

Doc para los demás agentes:
- Cómo agregar una nueva template (los siguientes 6 prompts).
- Convención: cada template es una carpeta `templates/{name}/` con `index.tsx`, `schema.ts`, `defaults.ts`.
- Cómo correr preview: `pnpm --filter @virus/remotion dev` → http://localhost:3000 (preview de remotion).
- Cómo render local: `pnpm exec remotion render tip out.mp4 --props='{...}'`.

## Verificación

```bash
pnpm --filter @virus/remotion dev
# Browser abre Remotion Studio en :3000
# Una composition 'placeholder' debe verse (1080x1920)
```

Crea una composition placeholder `Hello` que solo muestre "Virus" centrado, fuente Oxanium, fondo dark, accent verde. Los 6 templates reales los hacen los demás prompts.

## Output esperado

Remotion proyecto inicializado, schemas y utilidades listas. Cada template (T3-P02..P07) puede importar `VideoInput`, `useTokens()`, `<SafeZones />`, `<VoiceoverAudio />`, `<BackgroundMusic />`.
