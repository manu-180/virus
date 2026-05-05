---
modelo: sonnet-4.6
modelo-id: claude-sonnet-4-6
agente: backend-architect
tanda: 5
depende-de: [T2-P01]
file-ownership:
  - apps/web/src/lib/quotas/
  - apps/web/src/lib/quotas/limits.ts
  - apps/web/src/lib/quotas/middleware.ts
  - packages/db/migrations/0005_usage_tracking.sql
duracion-estimada: 30 min
---

# T5-P04 — Rate limiting + tracking de cuotas

## Contexto

Para evitar:
- Que Manuel se explote la API de Anthropic con un loop infinito ($$$).
- Que ElevenLabs corte servicio por exceso de chars.
- Que un bug en Lambda renderice 500 videos del mismo idea.

## Tarea

### 1. Migración (`0005_usage_tracking.sql`)

```sql
CREATE TABLE usage_records (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('anthropic','elevenlabs','assemblyai','remotion_lambda')),
  units numeric NOT NULL,                      -- tokens, chars, segundos, segundos
  cost_usd numeric NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_usage_user_service_date ON usage_records (user_id, service, created_at DESC);

-- Función helper
CREATE OR REPLACE FUNCTION sum_usage_last_30d(p_user_id uuid, p_service text)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM usage_records
  WHERE user_id = p_user_id AND service = p_service
    AND created_at > now() - INTERVAL '30 days';
$$ LANGUAGE SQL STABLE;
```

### 2. Limits (`limits.ts`)

```ts
export const LIMITS_PER_USER = {
  anthropic: { perDayUsd: 5, perMonthUsd: 30 },
  elevenlabs: { perDayChars: 5000, perMonthChars: 100000 },
  assemblyai: { perDayMinutes: 30, perMonthMinutes: 600 },
  remotionLambda: { perDayRenders: 20, perMonthRenders: 200 },
};

export async function checkQuota(input: {
  userId: string;
  service: keyof typeof LIMITS_PER_USER;
  estimatedCostUsd?: number;
  estimatedUnits?: number;
}): Promise<{ allowed: boolean; reason?: string; usedThisMonth: number }>;

export async function recordUsage(input: {
  userId: string;
  service: keyof typeof LIMITS_PER_USER;
  units: number;
  costUsd: number;
  metadata?: Record<string, any>;
}): Promise<void>;
```

### 3. Middleware

Wrapper para los step calls del worker:
```ts
export async function withQuota<T>(
  service: keyof typeof LIMITS_PER_USER,
  userId: string,
  estimatedCost: number,
  fn: () => Promise<{ result: T; actualCost: number; actualUnits: number }>
): Promise<T>;
```

Si la cuota se excede → throw con mensaje claro. Inngest lo captura y notifica.

### 4. Apply en cada paso del worker

En cada función de T5-P02:
- Antes del API call: `checkQuota`.
- Después: `recordUsage` con costo real.

## Output esperado

Sistema que previene runaway costs y trackea uso real para mostrar en /settings/billing (T4-P06).
