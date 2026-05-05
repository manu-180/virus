---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 2
depende-de: []
file-ownership:
  - packages/shared/src/captions/
  - packages/shared/src/captions/assemblyai.ts
  - packages/shared/src/captions/whisper-fallback.ts
  - packages/shared/src/captions/types.ts
  - packages/shared/src/captions/segment-mapper.ts
  - packages/shared/src/captions/index.ts
duracion-estimada: 45 min
---

# T2-P05 — Captions con timestamps word-level (AssemblyAI + fallback)

## Contexto

Para que las captions del video tengan **highlight palabra por palabra sincronizado al audio** (clave para retención según `proyecto.md §2`), necesitamos timestamps a nivel palabra. ElevenLabs no los provee. Soluciones:

1. **AssemblyAI** — paga, $0.37/h, calidad muy alta, timestamps incluidos.
2. **Whisper local** — gratis, requiere modelo descargado, más lento, calidad ok.

Vas a implementar AssemblyAI como default y Whisper como fallback opcional.

## Tarea

### 1. Tipos (`captions/types.ts`)

```ts
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;        // 0-1
}

export interface CaptionLine {
  words: Word[];
  startMs: number;
  endMs: number;
  text: string;              // join de palabras
}

export interface Captions {
  language: 'es' | 'en';
  totalDurationMs: number;
  words: Word[];
  lines: CaptionLine[];      // agrupados en líneas de ~3-5 palabras (caption-style)
}
```

### 2. AssemblyAI client (`assemblyai.ts`)

```ts
export async function transcribeWithAssemblyAI(input: {
  audioUrl: string;          // URL pública (Supabase storage signed URL)
  language: 'es' | 'en';
  apiKey?: string;
}): Promise<Captions>;
```

Flow:
1. POST `https://api.assemblyai.com/v2/transcript` con `audio_url`, `language_code: 'es'`, `word_boost: ['Cursor', 'Claude', 'TypeScript', 'React', 'Next.js', 'Supabase']` (boost de términos técnicos comunes).
2. Polling cada 1s a `/v2/transcript/{id}` hasta `status === 'completed'` (max 60s timeout).
3. Mapear `words` a nuestro tipo (`AssemblyAI` devuelve `start`/`end` en ms ya).

### 3. Whisper fallback (`whisper-fallback.ts`)

Si Manuel no quiere pagar AssemblyAI o quiere correr offline:
- Usar `whisper.cpp` o `nodejs-whisper` (depende de cuál sea más estable a 2026).
- Modelo: `medium` para español argentino (small es muy malo en argentino).
- Timestamps word-level requieren `--word_timestamps` flag.

Solo implementar el wrapper; el modelo se descarga en setup manual (deja una nota en docs).

### 4. Segment mapper (`segment-mapper.ts`)

Dado:
- `words: Word[]` (word-level timestamps reales del audio)
- `segments: Array<{ voiceover: string; index: number }>` (del script)

Devolvé:
```ts
Array<{
  segmentIndex: number;
  startSec: number;
  endSec: number;
  words: Word[];
}>
```

Algoritmo: alinear palabras del transcript con voiceovers de cada segment usando matching aproximado (Levenshtein + sliding window). Esto reemplaza los `perSegmentTimings` estimados de T2-P04 con los reales.

### 5. Line builder

Función que toma `words: Word[]` y los agrupa en **líneas de 3-5 palabras** o cortes naturales (puntuación). Cada línea ≤ 6 palabras o ≤ 1.8 segundos para ser legible en pantalla.

```ts
export function groupWordsIntoLines(
  words: Word[],
  opts?: { maxWordsPerLine?: number; maxLineDurationMs?: number }
): CaptionLine[];
```

### 6. Helper de alto nivel (`index.ts`)

```ts
export async function generateCaptions(input: {
  audioPath: string;
  language: 'es' | 'en';
  segments: Array<{ voiceover: string; index: number }>;
  provider?: 'assemblyai' | 'whisper';
}): Promise<{
  captions: Captions;
  perSegment: Array<{
    segmentIndex: number;
    startSec: number;
    endSec: number;
    words: Word[];
  }>;
}>;
```

Si `provider === 'assemblyai'`: subir el audio a un signed URL (helper en T2-P06) o pasarle un URL público; si es `whisper`: usar archivo local.

## Reglas

- Cualquiera de los dos providers debe devolver el mismo tipo `Captions`.
- Si AssemblyAI falla y `provider !== 'assemblyai'` no estaba forzado, fallback automático a whisper con warning en logs.
- Cero archivos temporales sin limpiar.

## Output esperado

Package `@virus/shared/captions` que dado un audio + script segmentado, devuelve word-level timestamps reales mapeados a cada segment del script. Listo para que Remotion (T3) los consuma.

## Verificación

Script de prueba `scripts/try-captions.ts` que toma el MP3 generado por `try-tts.ts` y devuelve los caption lines.

```bash
pnpm tsx packages/shared/scripts/try-captions.ts
# Output: lines con palabras + timestamps
```
