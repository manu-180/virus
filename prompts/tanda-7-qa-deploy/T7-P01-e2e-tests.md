---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: test-automator
tanda: 7
depende-de: [T4-P07, T5-P02, T6-P03]
file-ownership:
  - apps/web/playwright.config.ts
  - apps/web/e2e/
  - apps/web/e2e/auth.spec.ts
  - apps/web/e2e/onboarding.spec.ts
  - apps/web/e2e/idea-to-video.spec.ts
  - apps/web/e2e/calendar.spec.ts
  - apps/web/e2e/settings.spec.ts
  - apps/web/e2e/fixtures/
duracion-estimada: 60 min
---

# T7-P01 — Tests E2E con Playwright

## Contexto

Cubrir los flows críticos. **No** mockear todo: los tests que importan son los que validan el sistema real.

## Tarea

### Setup

- `playwright.config.ts` con projects `chromium`, `firefox`, `webkit`. Default chromium.
- `baseURL: http://localhost:3000`.
- Reutilización de auth state vía `storageState` (login una vez por suite).

### Specs

#### `auth.spec.ts`
- Visit `/login` → Google OAuth flow (mockear redirect en test env).
- Magic link: ingresar email, verificar mensaje "Revisá tu email".
- Logout → vuelve a /login.

#### `onboarding.spec.ts`
- User nuevo entra → redirect a /onboarding.
- Completar 4 pasos (skip voice clone con default voice).
- Llegar a /dashboard con estado correcto.

#### `idea-to-video.spec.ts` (el más importante)
- Login.
- POST /api/ideas/generate → recibir 5 ideas.
- Aprobar 1 idea.
- Esperar a que `videos` row tenga `status='ready'` (timeout 10 min, polling).
- Verificar que el MP4 se descargue correctamente.

(En CI corre con mocks de las APIs externas. En staging real corre completo cada noche.)

#### `calendar.spec.ts`
- Programar un video existente → aparece en el calendario.
- Botón "Generar batch 7 días" → 7 ideas en pending.

#### `settings.spec.ts`
- Cambiar pillares en /settings/brand → persistir.
- Voice clone wizard: subir un .wav fixture → mock de ElevenLabs API → verificar `voice_clone_id` guardado.

### Fixtures

- `fixtures/sample-voice.wav` (5s de audio test).
- `fixtures/mock-supabase.ts` (helper para crear test users).
- `fixtures/mock-anthropic.ts` (msw handlers).

## Reglas

- Cada test es **idempotente**: puede correr en cualquier orden.
- Cleanup después de cada test (delete user de auth.users).
- CI: GitHub Actions corre Playwright en cada PR.

## Output esperado

Suite E2E que cubre los happy paths. >70% de los flows críticos cubiertos.
