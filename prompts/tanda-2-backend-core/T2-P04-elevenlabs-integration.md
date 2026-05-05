---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: [T1-P05]
file-ownership:
  - packages/shared/src/audio/
  - packages/shared/src/audio/elevenlabs.ts
  - packages/shared/src/audio/post-process.ts
  - packages/shared/src/audio/types.ts
  - packages/shared/src/audio/index.ts
  - packages/shared/scripts/try-tts.ts
duracion-estimada: 60 min
---

# T2-P04 — Integración ElevenLabs + post-process de audio (ffmpeg)

## Contexto

Convertir scripts en audio narrado con la voz clonada de Manuel. Después aplicar post-processing (aceleración 1.15×, normalización LUFS, compresión, highpass) para que suene "Fireship-style".

Lee:
- `prompts/00-ARCHITECTURE.md`
- `proyecto.md` §4 (audio y narración)
- `packages/shared/src/audio/voice-config.ts` (creado por T1-P05)

## Tarea

### 1. Cliente ElevenLabs (`elevenlabs.ts`)

Cliente HTTP usando `fetch` nativo (sin SDK — el SDK oficial es bloated). Endpoints:

```ts
export interface SynthesizeOptions {
  text: string;
  voiceId?: string;        // default ELEVENLABS_VOICE_ID
  preset?: keyof typeof VOICE_PRESETS;  // educational | hotTake | speedBuild | story
  outputPath: string;       // local mp3 path
}

export async function synthesize(opts: SynthesizeOptions): Promise<{
  filePath: string;
  durationSec: number;
  bytes: number;
}>;
```

Implementación:
- POST a `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`.
- Body: `text`, `model_id`, `voice_settings: { stability, similarity_boost, style, use_speaker_boost }`.
- Response: stream MP3 → escribir a disco.
- Headers: `xi-api-key`, `Content-Type: application/json`.
- `output_format: 'mp3_44100_192'` (alta calidad).
- Reintentos: 3 con backoff exponencial.

### 2. Post-process (`post-process.ts`)

Usa `fluent-ffmpeg` o `child_process.spawn('ffmpeg', ...)`. Define cuál y justificá (recomiendo spawn directo: menos deps, más explícito).

```ts
export interface PostProcessOptions {
  inputPath: string;
  outputPath: string;
  speedMultiplier?: number;   // default 1.15
  targetLufs?: number;        // default -15
  highpassHz?: number;        // default 80
}

export async function postProcess(opts: PostProcessOptions): Promise<{
  filePath: string;
  durationSec: number;
}>;
```

Pipeline ffmpeg:
```
ffmpeg -i input.mp3 \
  -af "atempo=1.15,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,loudnorm=I=-15:LRA=11:TP=-1.5" \
  -ar 44100 -b:a 192k \
  output.mp3
```

Captura `stderr` para sacar la duración del audio (ffmpeg la imprime).

### 3. Helper de alto nivel (`index.ts`)

```ts
export async function generateAudioFromScript(input: {
  segments: Array<{ voiceover: string }>;
  preset: VoicePreset;
  outputDir: string;          // /tmp/audio-{videoId}
}): Promise<{
  rawMp3: string;
  processedMp3: string;
  durationSec: number;
  perSegmentTimings: Array<{ index: number; startSec: number; endSec: number }>;
}>;
```

Estrategia:
- **Opción A (simple, default):** concatenar voiceovers con un separador `[pausa 0.3s]`, sintetizar todo en 1 request, post-process. Después usar AssemblyAI (T2-P05) para sacar word-level timestamps que mapean a segments.
- **Opción B (alternativa):** sintetizar segment por segment + concatenar con `ffmpeg -f concat`. Más control pero +N requests + risk de prosodia rota entre cortes.

Implementá A. Devolvé `perSegmentTimings` estimados (proporcional al char count) — los reales los pone T2-P05 con AssemblyAI.

### 4. Validaciones

- `text.length > 0 && text.length < 5000` (límite ElevenLabs por request).
- `voiceId` matches regex `/^[a-zA-Z0-9]{20}$/`.
- ffmpeg disponible (`which ffmpeg` o `ffmpeg -version`); si no, error claro.

### 5. Script de prueba (`scripts/try-tts.ts`)

```ts
import { generateAudioFromScript } from '../src/audio';
import { VOICE_PRESETS } from '../src/audio/voice-config';

const out = await generateAudioFromScript({
  segments: [
    { voiceover: 'Estás escribiendo useEffect mal. Y no te diste cuenta.' },
    { voiceover: 'Sin cleanup, vas a tener memory leaks en producción.' },
    { voiceover: 'Mirá la versión correcta.' },
  ],
  preset: VOICE_PRESETS.educational,
  outputDir: '/tmp/virus-test',
});

console.log(out);
```

```bash
pnpm tsx packages/shared/scripts/try-tts.ts
# Genera processedMp3, debe sonar bien
```

## Dependencias

```bash
pnpm --filter @virus/shared add zod
# ffmpeg debe estar en PATH del sistema (instrucción manual en docs)
```

## Reglas

- Cero `any`. Todo tipado.
- Errores claros: si ElevenLabs falla, devolvé un error con `code` y `httpStatus`, no un genérico.
- No bloquees el event loop: usá streams en sintetize, no `await fetch().then(r => r.arrayBuffer())` para 60s de audio.
- Limpiar archivos temporales si la operación falla a mitad.

## Output esperado

Package `@virus/shared/audio` que dado un array de voiceovers + preset, devuelve un MP3 listo para Remotion. Probado con script CLI.
