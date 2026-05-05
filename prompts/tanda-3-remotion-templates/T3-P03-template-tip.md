---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 3
depende-de: [T3-P01, T3-P02]
file-ownership:
  - packages/remotion/src/templates/tip/
  - packages/remotion/src/templates/tip/index.tsx
  - packages/remotion/src/templates/tip/schema.ts
  - packages/remotion/src/templates/tip/defaults.ts
  - packages/remotion/src/templates/tip/sample.json
duracion-estimada: 60 min
---

# T3-P03 — Template "Tip único" (formato más usado, 12-25s)

## Contexto

El formato "tip único" es el más viral del nicho dev. Estructura típica:
- 0-2s: hook ("Estás escribiendo useEffect mal")
- 2-5s: setup ("Si no tenés cleanup, memory leak en producción")
- 5-15s: demo del problema → solución (código antes/después)
- 15-20s: payoff ("Así de simple")
- 20-25s: CTA

Lee:
- `proyecto.md` §1, §2, §3 hooks #1, #4, #9, #12
- `packages/remotion/src/lib/types.ts` (videoInputSchema)
- `packages/remotion/src/components/index.ts` (componentes shared)

## Tarea

### 1. Schema (`schema.ts`)

```ts
import { videoInputSchema } from '@/lib/types';
export const tipSchema = videoInputSchema;     // usa el schema general
```

### 2. Defaults (`defaults.ts`)

Datos sintéticos realistas para que se vea bien en Remotion Studio sin pipeline:

```ts
export const tipDefaults = {
  totalDurationSec: 22,
  themeColor: '#3ECF8E',
  language: 'es' as const,
  audioUrl: 'https://example.com/sample.mp3',
  segments: [
    {
      index: 0, role: 'hook', startSec: 0, endSec: 2.5,
      voiceover: 'Estás escribiendo useEffect mal. Y ni cuenta te das.',
      onScreenText: 'useEffect mal escrito',
      visualCue: 'hook-card-punch',
    },
    {
      index: 1, role: 'setup', startSec: 2.5, endSec: 6,
      voiceover: 'Si no tenés cleanup function, memory leak en producción asegurado.',
      visualCue: 'code-block-typewriter',
      codeSnippet: { language: 'tsx', code: 'useEffect(() => {\n  const id = setInterval(tick, 1000);\n}, []);' },
    },
    // ... resto
  ],
  captions: { words: [/* mock */] },
  brand: { handle: '@manunavarro' },
};
```

### 3. Componente (`index.tsx`)

```tsx
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, HookCard, CodeBlock, CtaCard, ZoomPunch, FlashTransition, SoundEffect } from '@/components';
import { VoiceoverAudio, BackgroundMusic, SafeZones } from '@/lib';
import { useTokens } from '@/lib/use-tokens';
import type { VideoInput } from '@/lib/types';

export const TipTemplate: React.FC<VideoInput> = (props) => {
  const { themeColor, audioUrl, segments, captions, musicMood, brand } = props;
  const { fps } = useVideoConfig();
  const tokens = useTokens(themeColor);

  return (
    <AbsoluteFill style={{ background: tokens.bg, fontFamily: tokens.fonts.sans }}>
      {/* Audio: voiceover + música */}
      <VoiceoverAudio url={audioUrl} />
      <BackgroundMusic mood={musicMood ?? 'lofi'} volume={0.18} />

      {/* Render por segment con Sequence */}
      {segments.map((seg) => {
        const startFrame = Math.round(seg.startSec * fps);
        const durFrames = Math.round((seg.endSec - seg.startSec) * fps);

        return (
          <Sequence key={seg.index} from={startFrame} durationInFrames={durFrames}>
            {seg.role === 'hook' && (
              <ZoomPunch>
                <HookCard text={seg.onScreenText ?? seg.voiceover} themeColor={themeColor} variant="punch" />
              </ZoomPunch>
            )}
            {seg.codeSnippet && (
              <CodeBlock
                code={seg.codeSnippet.code}
                language={seg.codeSnippet.language}
                themeColor={themeColor}
                animation="typewriter"
              />
            )}
            {seg.role === 'cta' && (
              <CtaCard text={seg.voiceover} handle={brand.handle} themeColor={themeColor} />
            )}
            {seg.soundEffect && <SoundEffect type={seg.soundEffect} atFrame={0} />}
          </Sequence>
        );
      })}

      {/* Captions globales (sobre todo el video) */}
      <Captions words={captions.words} themeColor={themeColor} style="highlight-word" position="bottom" />

      {/* Flash transitions entre segments */}
      {segments.slice(1).map((seg) => (
        <FlashTransition key={`flash-${seg.index}`} color={themeColor} />
      ))}

      <SafeZones enabled={false} />
    </AbsoluteFill>
  );
};
```

### 4. Sample JSON (`sample.json`)

Un input realista completo (~25s, con captions reales generadas a mano simulando AssemblyAI). Sirve para CLI testing:

```bash
pnpm exec remotion render tip out.mp4 --props=./packages/remotion/src/templates/tip/sample.json
```

### 5. Variantes visuales del template

El template debe verse bien con diferentes themeColors. Implementar 3 micro-variantes que el orchestrator (T5-P02) puede elegir:

- `dense`: muchos cortes, código grande, estilo Fireship.
- `minimal`: un solo bloque de código central, fondo limpio.
- `split`: side-by-side antes/después.

Esto se controla con un campo opcional `variant: 'dense' | 'minimal' | 'split'` en los inputProps. Default `dense`.

## Reglas

- Cero hardcodeos de color: todo via `themeColor`.
- Captions SIEMPRE on, en safe zone bottom.
- Hook en safe zone middle/top (no debajo del 70% inferior).
- Si `seg.endSec > totalDurationSec`, clamp.
- Si `audioUrl` no carga, fallback silencio (no romper el render).

## Output esperado

Template "tip" funcional, registrado en Root.tsx, visible en Remotion Studio con el sample. Render local exitoso a MP4.

## Verificación

```bash
pnpm --filter @virus/remotion dev
# Studio abre, seleccionar composition "tip"
# Reproducir: video coherente con audio mock + captions sincronizadas

pnpm --filter @virus/remotion exec remotion render tip out.mp4 --props=./src/templates/tip/sample.json
# Genera out.mp4 1080x1920 H.264
```
