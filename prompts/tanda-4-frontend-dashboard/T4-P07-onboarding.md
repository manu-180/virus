---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T4-P06]
file-ownership:
  - apps/web/src/app/(dashboard)/onboarding/
  - apps/web/src/app/(dashboard)/onboarding/page.tsx
  - apps/web/src/app/(dashboard)/onboarding/_steps/
  - apps/web/src/components/onboarding-gate.tsx
duracion-estimada: 45 min
---

# T4-P07 — Onboarding flow (primera vez)

## Contexto

Cuando Manuel (o cualquier user) entra por primera vez, hay que llevarlo de la mano por el setup. Si no completa setup mínimo, no puede usar el sistema.

## Tarea

### 1. `<OnboardingGate />`

Wrapper en `(dashboard)/layout.tsx` que verifica:
- Profile creado: ✅ automático en T1-P02 trigger.
- Brand voice configurado: `profiles.brand_voice` no null.
- Voice clone hecho: `profiles.voice_clone_id` no null.
- Pilares definidos: `content_pillars` count >= 1.

Si falta alguno, redirect a `/onboarding`.

### 2. `/onboarding` — wizard 4 pasos

#### Paso 1 — Bienvenida
- Logo, hero "Bienvenido a Virus, Manuel".
- Explicación de 3 puntos:
  1. Generamos ideas virales basadas en research real.
  2. Convertimos en videos verticales con tu voz.
  3. Vos solo descargás y publicás.
- Botón "Empezar".

#### Paso 2 — Marca personal
Mini versión del form de `/settings/brand`:
- Handle.
- Idioma + audiencia.
- Pilares (sliders preset 60/30/10).
- 3 temas favoritos.

Submit → guarda y siguiente.

#### Paso 3 — Voice clone
Reusa el wizard de `/settings/voice` (componente compartido).

Permite "Skip por ahora" → en ese caso usa una voz default de ElevenLabs (Mateo o similar). Aviso: "Vas a tener menor retención que con tu voz; podés clonarla después en Settings".

#### Paso 4 — Tu primer video
- "Generemos tu primer video" → click → genera 3 ideas → user elige 1 → directo a pipeline.
- Mientras renderiza, mostrar tour rápido (4 tooltips) del dashboard.

Final: redirect a `/dashboard` con confeti (`canvas-confetti`) + toast "Listo. Tu primer video estará en ~5 minutos."

### 3. Resumir progreso

Sidebar lateral del onboarding con checkmarks (paso 1 ✓, paso 2 ✓, ...).

Si user cierra y vuelve, retoma desde donde quedó.

## Reglas

- No es obligatorio; "skip" disponible (con consecuencias claras).
- Animaciones de transición entre pasos (slide horizontal).
- Validación robusta antes de avanzar.

## Output esperado

Onboarding fluido que evita un usuario perdido. Funciona también para futuros users si Manuel decide vender el SaaS.
