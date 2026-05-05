# Contributing

Cómo extender el sistema: agregar templates, prompts, y migraciones.

---

## Agregar un nuevo template de video

Los templates están en `packages/remotion/src/templates/`. Cada template es un componente React.

### Estructura de un template

```
packages/remotion/src/templates/mi-template/
├── index.tsx      — componente principal
├── schema.ts      — validación Zod de las props
└── defaults.ts    — valores por defecto para el Remotion Studio
```

### Paso 1 — Crear el directorio y los archivos

Usar un template existente como base:

```bash
cp -r packages/remotion/src/templates/tip packages/remotion/src/templates/mi-template
```

### Paso 2 — Definir el schema (`schema.ts`)

```typescript
import { z } from "zod";

export const MiTemplateSchema = z.object({
  segments: z.array(
    z.object({
      text: z.string(),
      startFrame: z.number(),
      endFrame: z.number(),
    })
  ),
  accentColor: z.string().default("#7C3AED"),
  audioUrl: z.string().optional(),
  captions: z.array(/* CaptionSegment */),
});

export type MiTemplateProps = z.infer<typeof MiTemplateSchema>;
```

### Paso 3 — Implementar el componente (`index.tsx`)

```typescript
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { MiTemplateProps } from "./schema";

export const MiTemplate: React.FC<MiTemplateProps> = ({ segments, accentColor }) => {
  const frame = useCurrentFrame();
  // tu lógica acá
  return <AbsoluteFill>{/* contenido */}</AbsoluteFill>;
};
```

**Reglas de safe zones:**
- Content area: `paddingTop: 250, paddingBottom: 350` (en px, en un canvas de 1080×1920)
- Nunca poner contenido crítico fuera de estos márgenes

### Paso 4 — Registrar el template en el composition root

En `packages/remotion/src/Root.tsx`:

```typescript
import { MiTemplate } from "./templates/mi-template";
import { MiTemplateSchema } from "./templates/mi-template/schema";
import { miTemplateDefaults } from "./templates/mi-template/defaults";

// Agregar dentro del <Composition> registry:
<Composition
  id="mi-template"
  component={MiTemplate}
  schema={MiTemplateSchema}
  defaultProps={miTemplateDefaults}
  width={1080}
  height={1920}
  fps={30}
  durationInFrames={/* calcular desde defaultProps */}
/>
```

### Paso 5 — Agregar el template al engine viral

En `packages/shared/src/viral/engine/suggestion-algorithm.ts`, agregar el nuevo template en el mapa `FORMAT_TO_TEMPLATE`:

```typescript
const FORMAT_TO_TEMPLATE: Record<string, string> = {
  tip: "tip",
  "hot-take": "hot-take",
  "speed-build": "speed-build",
  listicle: "listicle",
  story: "story",
  comparison: "comparison",
  "mi-formato": "mi-template", // ← agregar acá
};
```

### Paso 6 — Testear en Remotion Studio

```bash
pnpm --filter @virus/remotion studio
# Abrir http://localhost:3001
# Tu template debe aparecer en el selector izquierdo
```

---

## Agregar un nuevo prompt de Claude

Los prompts están en `packages/shared/src/ai/prompts/`. Son funciones TypeScript que retornan strings.

### Estructura de un prompt

```typescript
// packages/shared/src/ai/prompts/mi-prompt.ts

export function buildMiPromptMessages(input: {
  context: string;
  projectName: string;
}): { role: "user"; content: string }[] {
  return [
    {
      role: "user",
      content: `Sos un experto en...
      
Contexto del proyecto: ${input.projectName}
${input.context}

Tu tarea: ...`,
    },
  ];
}
```

### Integrar en un job de Inngest

En `apps/worker/src/functions/`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { buildMiPromptMessages } from "@virus/shared/ai/prompts/mi-prompt";

const anthropic = new Anthropic();

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: buildMiPromptMessages({ context, projectName }),
});
```

**Siempre usar `claude-sonnet-4-6` para prompts de producción** (más rápido y barato que Opus). Usar `claude-opus-4-7` solo para tareas de análisis pesado o decisiones arquitectónicas.

### Agregar prompt caching (recomendado)

Si el prompt tiene un system prompt largo que no cambia, usar cache:

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: "Tu system prompt largo...",
      cache_control: { type: "ephemeral" }, // ← caching
    },
  ],
  messages: buildMiPromptMessages(input),
});
```

---

## Agregar una migración de base de datos

Las migraciones están en `packages/db/supabase/migrations/`. Son archivos SQL numerados.

### Convención de nombres

```
YYYYMMDDHHMMSS_descripcion_corta.sql
```

Ejemplo: `20260115120000_add_video_thumbnails.sql`

### Crear la migración

```bash
# Opción A: Supabase CLI (recomendado)
npx supabase migration new add_video_thumbnails
# Crea el archivo con timestamp correcto

# Opción B: Manual
touch packages/db/supabase/migrations/$(date +%Y%m%d%H%M%S)_mi_cambio.sql
```

### Escribir la migración

```sql
-- packages/db/supabase/migrations/20260115120000_add_video_thumbnails.sql

ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Si cambiás la estructura de una tabla con RLS, siempre verificar las políticas
-- CREATE POLICY si hace falta cubrir la nueva columna
```

**Reglas:**
- Siempre usar `IF NOT EXISTS` / `IF EXISTS` para que la migración sea idempotente
- Nunca hacer `DROP TABLE` o `DROP COLUMN` sin confirmación explícita de Manuel
- Si la migración requiere backfill de datos, hacerlo en un paso separado

### Aplicar la migración

```bash
# Desarrollo local
npx supabase db push

# Producción
npx supabase db push --project-ref <PROJECT_REF>
```

### Actualizar los TypeScript types

Después de cada migración:

```bash
pnpm --filter @virus/db generate
```

Esto regenera `packages/db/src/types.ts` con los nuevos tipos.

---

## Convenciones de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/).

### Formato

```
<tipo>(<scope>): <descripción corta>

[body opcional]

[footer opcional]
```

### Tipos

| Tipo | Cuándo usarlo |
|------|--------------|
| `feat` | Nueva funcionalidad |
| `fix` | Bugfix |
| `refactor` | Refactor sin cambio funcional |
| `chore` | Tareas de mantenimiento (deps, config) |
| `docs` | Solo documentación |
| `test` | Solo tests |
| `style` | Formato, espacios (sin cambio de lógica) |

### Scopes

| Scope | Qué cubre |
|-------|-----------|
| `web` | `apps/web/` |
| `worker` | `apps/worker/` |
| `db` | `packages/db/` |
| `remotion` | `packages/remotion/` |
| `shared` | `packages/shared/` |
| `infra` | `infra/` |
| `docs` | `docs/` |

### Ejemplos

```bash
git commit -m "feat(remotion): add comparison template with side-by-side layout"
git commit -m "fix(worker): retry synthesize-audio on ElevenLabs 429"
git commit -m "chore(deps): update remotion to 4.0.250"
git commit -m "docs: add troubleshooting for misaligned captions"
```

---

## Correr migraciones en dev

```bash
# Ver estado de las migraciones
npx supabase db status

# Aplicar todas las pendientes
npx supabase db push

# Resetear a estado limpio (⚠️ borra todos los datos)
npx supabase db reset

# Hacer seed después del reset
pnpm --filter @virus/db seed
```

---

## Tips generales

- **Antes de tocar el viral engine:** leer `packages/shared/src/viral/README.md`. El algoritmo de sugerencias tiene invariantes que es fácil romper.
- **Antes de modificar el schema:** verificar que los cambios no rompan las políticas de RLS existentes.
- **Antes de agregar un job de Inngest:** revisar que el event type esté definido en `packages/inngest/src/`.
- **Para testear un job manualmente:** usar el Inngest dashboard en `localhost:8288` → "Send event".
