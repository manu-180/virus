# Setup ElevenLabs — Guía paso a paso (15 minutos)

## 1. Crear cuenta y elegir plan

1. Ir a **https://elevenlabs.io/sign-up** y registrarse.
2. Elegir el plan **Creator ($22/mes)**.
   - Incluye: 100K caracteres/mes, 10 voice clones, audio 192 kbps.
   - Para 30 videos/mes a ~200 chars c/u = 6K chars usados → sobra margen para regenerar y experimentar.
   - Si superás 30 videos/mes, subir a **Pro ($99/mes — 500K caracteres)**.
3. **NO usar el plan Free**: solo permite voces stock (no clonadas) y tiene restricciones comerciales.

---

## 2. Clonar tu voz (Instant Voice Cloning)

### Grabar la muestra de voz

Necesitás **1–3 minutos de audio limpio**. Seguí estos pasos:

1. Buscá un lugar silencioso (sin eco, sin aire acondicionado).
2. Usá el mejor micrófono que tengas:
   - Lavalier o SM58 → ideal.
   - Auriculares con mic → bien.
   - Mic de notebook → última opción.
3. Abrí **Audacity** (o cualquier grabador). Configurar: 48 kHz, mono, WAV.
4. Grabá estos 4 bloques (total ~2–3 min):

   **Bloque 1 — Texto técnico (1 min):**
   > Leé en voz alta el primer párrafo de tu propia web en español neutro argentino.

   **Bloque 2 — Hook con energía (30 seg):**
   > "Estás escribiendo useEffect mal. Y no te diste cuenta."

   **Bloque 3 — Tono relajado (30 seg):**
   > "Hoy te muestro cómo construí un SaaS en 60 segundos con vibe coding."

   **Bloque 4 — Pregunta directa (30 seg):**
   > "¿Qué AI tool usás vos? ¿Cursor o Claude Code?"

5. Editá mínimamente: borrá silencios al inicio/fin. Sin compresión ni reverb.
6. Exportá como **WAV** o **MP3 320 kbps**.

### Subir a ElevenLabs

1. Login → Sidebar izquierda → **"Voices"** → **"Add a new voice"** → **"Instant Voice Cloning"**.
2. Nombre: `Manuel ES`
3. Subí el archivo WAV/MP3.
4. Description: `Spanish Argentine, energetic, technical, 25-35`
5. Confirmá los permisos (es tu voz, no infringe nada).
6. Click **"Create"**.
7. **Copiá el Voice ID** que aparece — tiene formato similar a `21m00Tcm4TlvDq8ikWAM`. Lo necesitás en el paso 4.

---

## 3. Obtener API Key

1. Click en tu avatar (esquina superior derecha) → **"Profile + API Key"**.
2. Click **"Create new API key"** → nombrarla `virus-prod`.
3. **Copiá la key ahora** — solo se muestra una vez.

---

## 4. Agregar variables al `.env.local`

Abrí el archivo `.env.local` en la raíz del proyecto y agregá:

```env
ELEVENLABS_API_KEY=el_xxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

Reemplazá los valores con tu API key real y tu Voice ID del paso 2.

---

## 5. Validar que todo funciona

Corré este comando en la terminal (con las env vars cargadas):

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

Si el archivo se reproduce con tu voz → **setup OK**.

---

## 6. Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `401 Unauthorized` | API key incorrecta | Verificar que copiaste la key completa en `.env.local` |
| `422 Unprocessable Entity` | Voice ID no existe o no es tuyo | Verificar que el Voice ID pertenece a tu cuenta |
| `429 Too Many Requests` | Rate limit (10 RPS en Creator) | Implementar backoff exponencial en el código |
| Voz suena robótica | Muestra de audio de baja calidad | Subir `stability` a 0.6 y `similarity_boost` a 0.85; regrabar con mejor mic |
