---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: frontend-developer
tanda: 4
depende-de: [T4-P01, T2-P08]
file-ownership:
  - apps/web/src/app/(dashboard)/projects/new/page.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/wizard.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/step-basics.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/step-patterns-upload.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/step-brand-upload.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/step-confirm.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/template-download-button.tsx
  - apps/web/src/app/(dashboard)/projects/new/_components/parse-status-watcher.tsx
duracion-estimada: 75 min
---

# T4-P09 — Wizard de creación de proyecto (4 pasos)

## Contexto

Manuel quiere crear un proyecto rápido. El wizard lo lleva en 4 pasos:

1. **Basics**: nombre, slug, niche, idioma, color, voz (opcional).
2. **Upload de patrones virales**: drag&drop del archivo `viral-patterns.{md|json|pdf|png|jpg}`. Botón para descargar plantilla (sample-patterns.md del seed).
3. **Upload de info de marca**: drag&drop del archivo `project-info.{md|json|pdf|png|jpg}`. Botón para descargar plantilla.
4. **Confirm**: muestra resumen + estado de parseo de los 2 archivos en vivo (Realtime channel). Cuando ambos están `parse_status='ok'`, habilita botón "Generar primer video" que va a `/projects/[slug]`.

## Lee primero
- `apps/web/src/server/projects/actions.ts` y `upload.ts` (T2-P08).
- `apps/web/src/lib/realtime/` (T2-P01) — Supabase Realtime client.
- `packages/shared/src/viral/seeds/apex-dev/sample-patterns.md` y `sample-brand.md` (T1-P08).

## Tarea

### 1. `wizard.tsx` (client component, stepper)

```tsx
'use client';
const [step, setStep] = useState<1|2|3|4>(1);
const [data, setData] = useState<WizardState>({});
// Persistir en localStorage para no perder progreso si recarga.
```

UI: stepper horizontal en top, content del step abajo, footer con "Atrás" / "Siguiente". En step 4, "Siguiente" se reemplaza por "Generar primer video" (deshabilitado hasta `parse_status='ok'`).

### 2. Step Basics

Form con react-hook-form + zod (CreateProjectSchema). Campos: name, slug (auto-derivado de name, editable), niche (combobox con sugerencias: dev, chatbot, education, fitness, ecommerce, ...), language, themeColor (swatches + custom HEX), voiceCloneId (combobox que lista voces ElevenLabs del user — opcional).

Submit del step llama a `createProject()` (server action) y guarda `projectId` en el state del wizard.

### 3. Step Patterns Upload

UI:
- Botón "Descargar plantilla" → descarga `sample-patterns.md` (T1-P08) precargado con headings.
- Drag&drop zone:
  - Acepta `.md`, `.json`, `.pdf`, `.png`, `.jpg`, `.webp`.
  - Max 10MB.
  - Preview del nombre + tamaño.
  - Botón "Subir".
- Al subir: llama `uploadProjectFile({ projectId, kind:'viral_patterns', file })`. Ve un spinner.
- Si falla validación: mostrar error inline.
- Tras éxito: pasa a step 3.

### 4. Step Brand Upload

Idéntico al step 2 pero con `kind: 'project_info'` y plantilla `sample-brand.md`.

### 5. Step Confirm + Parse Watcher

- Resumen del proyecto (las decisiones de basics).
- Lista de los 2 archivos subidos con badge de estado: 🟡 "Parseando..." → 🟢 "Listo" / 🔴 "Falló".
- `<ParseStatusWatcher>`: subscribe al Realtime channel `project:{projectId}` filtrado por evento `project.file.parsed`. Updatea badges en vivo.
- Si falla: botón "Reintentar" (re-dispara el evento Inngest llamando a un endpoint).
- Si ambos OK: botón gigante con animación pulse "🎬 Generar primer video" → navega a `/projects/[slug]?autogenerate=1`.

### 6. `template-download-button.tsx`

Sirve el archivo md desde un endpoint estático o vía import-as-string. Click descarga con filename `sample-patterns.md` o `sample-brand.md`.

## Reglas

- **Persistencia**: state del wizard en localStorage con clave `wizard:project:{userId}` para resistir recargas.
- **Validación de slug en vivo**: debounced check contra `/api/projects?slug=...` para verificar unicidad.
- **A11y**: stepper con `aria-current="step"`, focus management entre pasos.
- **Cancelar**: botón "Cancelar" en topbar del wizard. Si hay datos no guardados, confirmación.
- **Móvil**: stepper se vuelve dropdown en <768px.

## Qué NO hagas

- NO escribas el endpoint de re-parse — pedíselo a T2-P09 (ya lo expone).
- NO toques la lista `/projects` (T4-P08).
- NO toques el detail page (T4-P10).

## Output esperado

Wizard funcional 4 pasos. Manuel arranca de cero, sube 2 archivos, ve parseo en vivo, click "Generar" → llega a `/projects/[slug]` con parámetro `autogenerate=1` que dispara la generación inmediatamente.

## Verificación

E2E manual: `/projects/new` → completar basics → subir `sample-patterns.md` → subir `sample-brand.md` → ver badges pasar a 🟢 → botón "Generar primer video" habilitado → click → llega a project detail con generación en curso.
