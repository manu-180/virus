---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01]
file-ownership:
  - apps/web/src/app/(dashboard)/dashboard/settings/
  - apps/web/src/app/(dashboard)/dashboard/settings/account/
  - apps/web/src/app/(dashboard)/dashboard/settings/voice/
  - apps/web/src/app/(dashboard)/dashboard/settings/brand/
  - apps/web/src/app/(dashboard)/dashboard/settings/schedule/
  - apps/web/src/app/(dashboard)/dashboard/settings/billing/
  - apps/web/src/app/api/voice/upload-sample/route.ts
  - apps/web/src/app/api/voice/clone/route.ts
duracion-estimada: 75 min
---

# T4-P06 — Settings (account / voice clone / brand voice / schedule / billing)

## Contexto

Settings cubren 5 áreas. Cada una en su sub-ruta.

## Tarea

### 1. `/settings/account`

- Email (de auth, read-only).
- Handle (`@manunavarro`) — editable, único.
- Avatar (upload a `voice-samples` bucket pero subfolder `avatars/`, signed URL).
- Botón "Eliminar cuenta" (con doble confirmación).

### 2. `/settings/voice` (la más importante)

#### Status del voice clone
- Si ya hay `voice_clone_id` en profile: mostrar "Voz: Manuel ES (clonada el 2026-05-01)" + botón "Re-clonar".
- Si no: CTA grande "Cloná tu voz en 3 minutos".

#### Wizard de voice cloning (3 pasos)

**Paso 1 — Instrucciones de grabación**:
- Texto explicativo basado en `docs/setup/elevenlabs.md`.
- 4 prompts a leer en voz alta:
  - 1 minuto técnico (texto provisto).
  - 30s hook con energía.
  - 30s tono relajado.
  - 30s preguntas.
- Botón "Empezar a grabar".

**Paso 2 — Grabación in-browser**:
- Usar `MediaRecorder` API.
- Captura mic, muestra waveform en vivo (`wavesurfer.js`).
- Botón "Parar". Reproducir antes de subir.
- Calidad target: 48 kHz mono, WAV (browser puede dar webm — convertir server-side a wav con ffmpeg).

**Paso 3 — Cloning**:
- Subir archivo a `voice-samples` bucket.
- POST /api/voice/clone con el path → server llama a ElevenLabs Instant Voice Cloning API:
  ```
  POST https://api.elevenlabs.io/v1/voices/add
  multipart/form-data: name="Manuel ES" + files[]=...wav
  ```
- Guarda `voice_id` en `profiles.voice_clone_id`.
- Test inmediato: sintetizar "Hola, soy [name], esta es mi voz clonada" y reproducirlo.
- Si suena bien → confirmar. Si no → permitir re-grabar.

### 3. `/settings/brand`

Configurar el "perfil de marca" para que Claude lo use al generar contenido.

Form con:
- **Pilares de contenido** (sliders que suman 100%):
  - Educacional %
  - Hot take %
  - Personal %
- **Tono de voz**: chips multiselect (`directo`, `irónico`, `técnico`, `accesible`, `contrarian`, `entusiasta`).
- **Idioma default**: `es-AR` / `en-US`.
- **Audiencia**: `LATAM` / `Global` / `Mixed`.
- **Temas favoritos**: tags input (`AI coding`, `vibe coding`, `Next.js`, etc.).
- **Temas a evitar**: tags input.
- **Hashtags fijos**: pueden agregar al final de cada caption (`#dev` `#programacion`).
- **CTA preferido**: `comment_keyword` / `tag_friend` / `save` / `follow`.
- **Handle**: `@usuario` que aparece en CTA card.

Save → update `profiles.brand_voice` JSONB.

### 4. `/settings/schedule`

- Frecuencia: `1/día` / `1/2 días` / `1/3 días` / `manual`.
- Hora preferida (default 9:00 y 19:00).
- Días off (default: ninguno).
- Plataformas activas (Instagram default).
- Auto-publicar: ❌ (siempre manual; Instagram no tiene API decente).

### 5. `/settings/billing`

Mostrar costos estimados del mes:
- Anthropic API usage (tokens consumidos × pricing).
- ElevenLabs (chars consumidos del plan).
- AssemblyAI (horas transcriptas).
- AWS Lambda (segundos de render).
- Total estimado USD.

Sin pagos integrados (Manuel paga cada servicio aparte). Solo informativo.

Botón "Ver invoice de cada servicio" → links a dashboards externos.

## Reglas

- Validar TODOS los inputs con Zod + react-hook-form.
- Voice clone es ASYNC: durante el upload + clone, mostrar progress.
- Errores de API ElevenLabs claros (mic con eco, archivo muy corto, quota exceeded).

## Output esperado

5 sub-pantallas funcionales. La más crítica (voice) debe permitir clonar la voz end-to-end desde la UI sin necesidad de tocar el dashboard de ElevenLabs.
