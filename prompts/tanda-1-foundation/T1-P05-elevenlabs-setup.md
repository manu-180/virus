---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: general-purpose
tanda: 1
depende-de: []
file-ownership:
  - docs/setup/elevenlabs.md
  - packages/shared/src/audio/voice-config.ts
duracion-estimada: 30 min (15 min agente + 15 min Manuel haciendo el setup manual)
---

# T1-P05 — Setup ElevenLabs (con guía paso a paso para Manuel)

## Contexto

El sistema necesita **voz sintética de calidad** para narrar los videos. ElevenLabs es la mejor opción en 2026 para:
1. **Voice cloning** (clonar la voz de Manuel desde 1-3 minutos de muestra).
2. **Text-to-Speech multilingual v2 / v3** con control de emoción y velocidad.

Tu tarea es:
1. Generar una **guía paso a paso** que Manuel pueda seguir en 15 minutos para tener todo configurado.
2. Crear un archivo de configuración de voz con presets pensados para los formatos de video.

## Guía a producir (`docs/setup/elevenlabs.md`)

Tiene que ser tipo "para mi mamá" porque Manuel no quiere perder tiempo investigando. Incluí:

### 1. Crear cuenta y elegir plan

- URL exacta: https://elevenlabs.io/sign-up
- Plan recomendado: **Creator ($22/mes — 100K caracteres, 10 voice clones, 192 kbps)**.
  - Justificación: a 200 caracteres por video × 30 videos/mes = 6K chars; queda margen para regenerar y experimentar.
  - Si usa más de 30 videos/mes, subir a **Pro ($99/mes — 500K caracteres)**.
- Plan Free **NO sirve**: solo permite voces stock, no clonadas, y comercial restricted.

### 2. Voice Cloning de Manuel — instrucciones

Para clonar bien una voz se necesita:
- **Instant Voice Cloning** (incluido en Creator): 1-3 minutos de audio limpio.
- **Professional Voice Cloning** (solo Pro+): mejor calidad, requiere ~30 min de audio.

Recomendar **Instant Voice Cloning** primero (10 min de Manuel grabando).

#### Cómo grabar la muestra

Pasos exactos:
1. Buscar un lugar silencioso (sin eco, sin AC).
2. Usar el micrófono más decente que tenga (auriculares con mic > mic de notebook). Si tiene SM58 / lavalier, mejor.
3. Audacity o cualquier grabador. 48 kHz, mono, WAV.
4. **Guion sugerido**: 2-3 minutos leyendo en español neutro argentino, con variaciones de tono:
   - 1 minuto leyendo un texto técnico (ej. el primer párrafo de "Tu negocio en internet" de su propia web).
   - 30 segundos haciendo un hook con energía: "Estás escribiendo useEffect mal. Y no te diste cuenta."
   - 30 segundos en tono más relajado: "Hoy te muestro cómo construí un SaaS en 60 segundos con vibe coding."
   - 30 segundos preguntas: "¿Qué AI tool usás vos? ¿Cursor o Claude Code?"
5. Editar mínimamente: borrar silencios al inicio/fin, sin compresión ni reverb.
6. Exportar como WAV o MP3 320 kbps.

#### Subir a ElevenLabs

Pasos en la UI (válidos a 2026-05-01):
1. Login → Sidebar → "Voices" → "Add a new voice" → "Instant Voice Cloning".
2. Nombre: "Manuel ES" (vamos a tener varias voces eventualmente).
3. Subir el WAV.
4. Description: "Spanish Argentine, energetic, technical, 25-35".
5. Confirmar permisos (es la voz de Manuel, no infringe).
6. Click "Create".
7. Copiar el **Voice ID** que aparece (formato `21m00Tcm4TlvDq8ikWAM` o similar).

### 3. API Key

1. Profile (esquina superior derecha) → "Profile + API Key".
2. Click "Create new API key" → nombrarla "virus-prod".
3. Copiar el key (solo se muestra una vez).

### 4. Variables a agregar a `.env.local`

```env
ELEVENLABS_API_KEY=el_xxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

### 5. Validación

Manuel debe correr este snippet (que vos le dejás listo en la guía como bloque copiable) para verificar:

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/$ELEVENLABS_VOICE_ID" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hola, soy Manuel y este es un test del sistema Virus.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
  }' \
  --output test.mp3 && \
  ffplay test.mp3
```

Si el archivo se reproduce con la voz de Manuel → setup OK.

### 6. Troubleshooting

Listale los errores comunes:
- 401: API key incorrecta.
- 422: voice_id no existe o no es del user.
- 429: rate limit (10 RPS en Creator). Solución: backoff.
- Voz suena robótica: subir `stability` a 0.6, `similarity_boost` a 0.85, regrabar muestra con mejor mic.

## Archivo de config (`packages/shared/src/audio/voice-config.ts`)

```ts
export type VoiceModel = 'eleven_multilingual_v2' | 'eleven_v3' | 'eleven_turbo_v2_5';

export interface VoicePreset {
  name: string;
  modelId: VoiceModel;
  stability: number;          // 0-1
  similarityBoost: number;    // 0-1
  style?: number;             // 0-1 (solo v3)
  speakerBoost: boolean;
  outputFormat: 'mp3_44100_192' | 'mp3_44100_128' | 'pcm_44100';
}

// Presets por formato de video (de proyecto.md §4)
export const VOICE_PRESETS: Record<string, VoicePreset> = {
  // Tip único / educacional: tono claro, energético
  educational: {
    name: 'Educational',
    modelId: 'eleven_multilingual_v2',
    stability: 0.45,
    similarityBoost: 0.8,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Hot take: más sarcasmo, menor stability
  hotTake: {
    name: 'Hot Take',
    modelId: 'eleven_multilingual_v2',
    stability: 0.35,
    similarityBoost: 0.85,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Speed build: rápido, alta energía
  speedBuild: {
    name: 'Speed Build',
    modelId: 'eleven_turbo_v2_5',     // más rápido para iterar
    stability: 0.4,
    similarityBoost: 0.75,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Story / horror: más pausado, dramatic
  story: {
    name: 'Story',
    modelId: 'eleven_multilingual_v2',
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.3,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
};

// Velocidad de aceleración en post (proyecto.md: 1.1×–1.3×)
export const POST_PROCESSING = {
  speedMultiplier: 1.15,             // Manuel acelera en post con ffmpeg
  targetLufs: -15,
  compressorRatio: 3,
  highpassHz: 80,
};
```

## Output esperado

1. `docs/setup/elevenlabs.md` con la guía de 15 minutos paso a paso.
2. `packages/shared/src/audio/voice-config.ts` con los presets exportados.

## Notas

- NO crees integraciones HTTP (eso es T2-P05).
- NO toques `.env.local` ni credenciales de Manuel.
- La guía es para que Manuel la siga manualmente; vos no podés hacer el voice cloning.
