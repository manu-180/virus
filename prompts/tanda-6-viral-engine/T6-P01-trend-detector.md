---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: ai-engineer
tanda: 6
depende-de: [T2-P03, T1-P04]
file-ownership:
  - apps/worker/src/functions/detect-trends.ts
  - packages/shared/src/viral/trend-sources.ts
  - packages/shared/src/viral/trend-aggregator.ts
duracion-estimada: 60 min
---

# T6-P01 — Detector de tendencias (input adicional al idea generator)

## Contexto

El idea generator (T2-P03) usa el framework estático de proyecto.md. Pero las tendencias **cambian**. Este detector enriquece el input con señales frescas.

## Tarea

### 1. Sources (`trend-sources.ts`)

Implementar 3 sources (en orden de costo):

#### A. RSS feeds (gratis)
- Fireship YT channel RSS.
- The New Stack RSS.
- Hacker News top 50 RSS (filtrar por keywords dev).
- DEV.to top tags RSS.

Parse → extract titles + dates de últimos 14 días.

#### B. GitHub trending (gratis, scraping leve)
- `https://github.com/trending?since=daily&spoken_language_code=` con cheerio.
- Extract repo names + descriptions.
- Filtrar por categorías relevantes (frameworks, AI tools).

#### C. Reddit (gratis, oauth público)
- r/programming, r/webdev, r/reactjs, r/typescript top weekly.
- Reddit JSON public endpoint.

(Apify/Twitter oficial paid: NO al inicio. Manuel no quiere costo extra.)

### 2. Aggregator (`trend-aggregator.ts`)

```ts
export interface TrendSignal {
  source: 'rss' | 'github' | 'reddit';
  title: string;
  url: string;
  score: number;            // popularity proxy
  detectedAt: Date;
  keywords: string[];       // extracted via simple NLP
  category: 'ai_tool' | 'framework' | 'language' | 'bug_story' | 'meta' | 'other';
}

export async function aggregateTrends(opts?: {
  sinceDays?: number;
  topN?: number;
}): Promise<TrendSignal[]>;
```

Agregación:
1. Pull de todas las sources.
2. Dedup por URL.
3. Normalizar score (z-score por source).
4. Top N global.

### 3. Inngest function (`detect-trends.ts`)

Cron job: corre 2× por día (cada 12h). Guarda los top 50 trends en una tabla nueva `trends`.

```sql
CREATE TABLE trends (
  id bigserial PRIMARY KEY,
  source text,
  title text,
  url text UNIQUE,
  score numeric,
  keywords text[],
  category text,
  detected_at timestamptz,
  expires_at timestamptz DEFAULT (now() + INTERVAL '7 days')
);
```

Auto-cleanup de expired (> 7 días).

### 4. Integración con idea generator

Cuando T4-P03 dispara `generate-ideas`, pasarle al prompt de Claude las top 10 tendencias frescas como contexto:

```
[En el system prompt]
Tendencias frescas (últimos 7 días, ordenadas por relevancia):
1. {{title}} — {{category}}
...

Tomá en cuenta estas tendencias para sugerir hooks que estén "on the moment".
```

## Reglas

- Cero costo en APIs externas (todo RSS/scraping respetuoso).
- Cache: 1 request por source cada 12h, no más.
- Robustez: si una source falla, las otras siguen.

## Output esperado

Trends detector que enriquece la generación de ideas con señales actuales.
