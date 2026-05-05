---
modelo: opus-4.7-1M
modelo-id: claude-opus-4-7[1m]
agente: ai-engineer
tanda: 6
depende-de: [T2-P03, T4-P05]
file-ownership:
  - apps/worker/src/functions/analyze-performance.ts
  - apps/web/src/app/api/insights/generate/route.ts
  - packages/shared/src/ai/prompts/insights-analyst.ts
duracion-estimada: 75 min
---

# T6-P03 — Performance feedback loop (insights automáticos)

## Por qué Opus 4.7 1M

Vas a cargar TODA la historia de videos del usuario + sus métricas + el framework + los hooks usados. Análisis cross-temporal con cientos de videos requiere contexto grande para hacer correlaciones inteligentes.

## Contexto

Cuando hay >20 videos con métricas cargadas, el sistema empieza a generar **insights accionables** que feeden al idea generator.

## Tarea

### 1. Inngest function `analyze-performance.ts`

Cron weekly. Para cada user con >20 videos con performance:
1. Pull `videos` + `video_performance` + `video_ideas` últimos 90 días.
2. Llamar al prompt `insights-analyst` con todo el dataset.
3. Guardar insights en tabla nueva `insights`.

```sql
CREATE TABLE insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  type text,                    -- 'pillar_winner', 'hook_pattern', 'time_of_day', 'format_trend', etc.
  title text,
  description text,
  confidence numeric,           -- 0-1
  data jsonb,                   -- raw data que respalda el insight
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
```

### 2. Prompt analyst (`insights-analyst.ts`)

System prompt: "Sos un data analyst especializado en short-form video performance. Recibís datos de los últimos 90 días y devolvés 3-7 insights de alto valor accionables."

Output structured (tool):
```ts
{
  insights: Array<{
    type: 'pillar_winner' | 'hook_pattern' | 'time_of_day' | 'format_trend' | 'caption_style' | 'topic_match';
    title: string;             // 1 línea, accionable
    description: string;       // por qué + qué hacer
    confidence: number;        // 0-1
    actionable: boolean;
    suggestedAction?: string;
  }>;
  summary: string;             // 2-3 frases del estado general
}
```

Reglas:
- Solo insights con n suficiente (>=5 videos comparables).
- Cero hallucinaciones: si la data no soporta una conclusión, dice "datos insuficientes".
- Quote números reales: "tus tips tienen 2.3× más saves que tus hot takes (basado en 14 vs 6 videos)".

### 3. Feedback al idea generator

Cuando T2-P03 (idea generator) genera ideas, opcionalmente le pasamos los **3 insights más recientes** como contexto:

```
Contexto de performance (últimos 30 días):
1. Tus tips tienen 2.3× más saves que tus hot takes.
2. Postear a las 19hs te da 1.4× más views que a las 9hs.
3. Hooks tipo `curiosity_gap` con código: avg 8K views.

Generá ideas que aprovechen estos hallazgos.
```

Esto cierra el loop: el sistema aprende qué funciona para Manuel.

### 4. Endpoint manual `/api/insights/generate`

Para que Manuel dispare análisis on-demand desde /dashboard/performance.

### 5. Display en /dashboard/performance (modificación a T4-P05)

Sección "Insights" que lista los activos no expirados:
```
🎯 Tus tips tienen 2.3× más saves que tus hot takes.
   Sugerencia: subí ratio de tips a 70% del mix.
   [Ver data] [Ignorar]
```

## Output esperado

Sistema que aprende de la performance y mejora la generación. Insights accionables y honestos, no astrología.
