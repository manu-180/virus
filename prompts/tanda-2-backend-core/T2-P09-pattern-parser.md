---
modelo: opus-4.7
modelo-id: claude-opus-4-7
agente: ai-engineer
tanda: 2
depende-de: [T1-P02, T1-P04, T2-P03, T2-P06, T2-P07]
file-ownership:
  - apps/worker/src/functions/parse-project-file.ts
  - apps/worker/src/functions/parse-helpers/
  - apps/worker/src/functions/parse-helpers/pdf.ts
  - apps/worker/src/functions/parse-helpers/image.ts
  - apps/worker/src/functions/parse-helpers/claude-normalize.ts
  - apps/worker/src/functions/parse-helpers/index.ts
  - apps/worker/src/events/project-events.ts
duracion-estimada: 90 min
---

# T2-P09 — Parser de archivos de proyecto (markdown / json / pdf / imagen)

## Contexto

Cuando el user sube un archivo `viral_patterns` o `project_info` (T2-P08), se dispara un evento Inngest. Esta función:

1. Descarga el archivo de Supabase Storage.
2. Detecta el MIME y elige estrategia de extracción de texto.
3. Pasa el texto por Claude (Sonnet 4.6) que normaliza a JSON estructurado matcheando los Zod schemas de `@virus/shared/viral`.
4. Valida con Zod.
5. Inserta o updatea row en `project_patterns` o `project_brand` con `is_current=true` (el trigger de DB se encarga de bajar `is_current` de la versión anterior).
6. Updatea `project_files.parse_status` a `'ok'` o `'failed'`.

Lee primero:
- `prompts/00-ARCHITECTURE.md` — sección "Parser de archivos del proyecto".
- `packages/shared/src/viral/types.ts` y `packages/shared/src/viral/parser/` (T1-P04) — tipos + parsers determinísticos.
- `apps/web/src/lib/supabase/server.ts` (T2-P01) — admin client.
- `apps/web/src/lib/claude/` (T2-P03) — Claude client + cache.
- `apps/worker/src/inngest/` (T2-P07) — Inngest setup.

## Tarea

### 1. Función Inngest `parse-project-file.ts`

```ts
import { inngest } from '@/inngest';
import { parsePatterns, parseBrand } from '@virus/shared/viral/parser';

export const parseProjectFile = inngest.createFunction(
  {
    id: 'parse-project-file',
    retries: 3,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => { /* mark file as failed */ },
  },
  { event: 'project.file.uploaded' },
  async ({ event, step }) => {
    const { fileId } = event.data;

    // 1. Load file row
    const file = await step.run('load-file', () => loadProjectFile(fileId));

    // 2. Download from Storage
    const blob = await step.run('download', () => downloadFromStorage(file.storage_path));

    // 3. Extract text (depends on MIME)
    const extracted = await step.run('extract-text', () => extractText(blob, file.mime_type));

    // 4. Try deterministic parser first (md / json)
    let parsed = await step.run('parse-deterministic', () =>
      file.kind === 'viral_patterns'
        ? parsePatterns({ source: extracted.text, mimeType: extracted.mimeType, projectId: file.project_id })
        : parseBrand({ source: extracted.text, mimeType: extracted.mimeType, projectId: file.project_id }),
    );

    // 5. If failed/partial, ask Claude to normalize
    if (!parsed.ok) {
      parsed = await step.run('claude-normalize', () =>
        claudeNormalize({ text: extracted.text, kind: file.kind, projectId: file.project_id, partial: parsed.partial }),
      );
    }

    // 6. Persist
    if (parsed.ok) {
      await step.run('persist', () => persistParsed(file, parsed.data));
      await step.run('mark-ok', () => markFileStatus(fileId, 'ok'));
    } else {
      await step.run('mark-failed', () => markFileStatus(fileId, 'failed', parsed.error));
      throw new Error(`parse_failed: ${parsed.error}`);
    }
  },
);
```

### 2. `parse-helpers/pdf.ts`

```ts
import pdfParse from 'pdf-parse';
export async function extractFromPdf(blob: Blob): Promise<{ text: string; pageCount: number }>;
```

### 3. `parse-helpers/image.ts`

```ts
// Usa Claude Vision (Sonnet 4.6) para extraer estructura de la imagen.
// Si la imagen es un screenshot de un doc, OCR + Claude normaliza a markdown.
export async function extractFromImage(blob: Blob, kind: 'viral_patterns' | 'project_info'): Promise<{ text: string }>;
```

Prompt de extracción: pedile a Claude Vision que devuelva markdown con los headings esperados (`## Hooks`, `## Formatos`, etc.) para que el parser determinístico de T1-P04 lo lea sin más pasadas.

### 4. `parse-helpers/claude-normalize.ts`

Función que toma texto crudo + tipo + parseo parcial (si hay) y le pide a Claude Sonnet 4.6:

> "Convertí este input a JSON que valide contra este schema Zod: {schema_json}. Si faltan campos, inferí defaults razonables y agrega `_inferred: true` por campo. Si hay info contradictoria, priorizá la más específica. Output: SOLO el JSON, sin markdown."

Usa **prompt caching** sobre el schema (es estable). Costo bajo por archivo (~$0.005-0.02).

Devuelve `{ ok: true, data } | { ok: false, error }`.

### 5. `parse-helpers/index.ts` — `extractText()` y `persistParsed()`

```ts
export async function extractText(blob: Blob, mime: string): Promise<{ text: string; mimeType: string }>;

export async function persistParsed(
  file: ProjectFile,
  data: ProjectPatterns | ProjectBrand,
): Promise<void> {
  // Upsert en project_patterns o project_brand con is_current=true.
  // El trigger BEFORE INSERT (T1-P02) baja is_current de la versión anterior.
}

export async function markFileStatus(
  fileId: string,
  status: 'ok' | 'failed',
  error?: string,
): Promise<void>;
```

### 6. Eventos (`events/project-events.ts`)

```ts
// Tipado fuerte del evento que dispara T2-P08
export interface ProjectFileUploadedEvent {
  name: 'project.file.uploaded';
  data: {
    fileId: string;
    projectId: string;
    kind: 'viral_patterns' | 'project_info';
    version: number;
  };
}

// Evento que emite cuando el parseo termina (consumido por UI vía Realtime)
export interface ProjectFileParsedEvent {
  name: 'project.file.parsed';
  data: {
    fileId: string;
    projectId: string;
    status: 'ok' | 'failed';
    error?: string;
  };
}
```

## Reglas de calidad

- **Idempotencia**: si Inngest reintenta, el resultado es el mismo. Usar `version` + `is_current` flag para no duplicar rows.
- **Failure visible**: cuando el parseo falla, el user en la UI ve el error legible y un botón "Reintentar".
- **Caching**: prompt cache sobre el schema Zod (estable). Costo objetivo <$0.02 por archivo parseado.
- **Timeouts**: max 60s por archivo. Si supera, `parse_status='failed'` con `error='timeout'`.
- **Sanity checks post-parseo**: si `patterns.hooks.length < 5`, marcar como warning (no failed) y notificar al user "tu archivo tiene pocos hooks, considerá expandir".

## Qué NO hagas

- NO escribas el orchestrator de generación (eso es T5-P02 / T5-P05).
- NO toques server actions de `apps/web/` (eso es T2-P08).
- NO uses Claude Opus para esto — Sonnet 4.6 alcanza para parsing/normalización.

## Output esperado

Función Inngest production-ready. Sube un MD válido → 30-60s después aparece parseado en `project_patterns` con `is_current=true`. Sube uno corrupto → `project_files.parse_status='failed'` con error legible.

## Verificación

```bash
cd apps/worker
pnpm test src/functions/parse-project-file.test.ts
```

Test fixture: subir el `sample-patterns.md` del seed (T1-P08) → assertEqual con el `patterns.json` del seed (idempotencia end-to-end).
