-- ============================================================
-- 0016: Extend usage_records for visual providers + spend RPCs
-- ============================================================
--
-- Reuses the existing usage_records table (created in 0011).
-- Adds 'luma', 'gemini', 'fal' as valid services so the worker
-- can log per-call cost for circuit-breaker enforcement.

ALTER TABLE public.usage_records
  DROP CONSTRAINT IF EXISTS usage_records_service_check;

ALTER TABLE public.usage_records
  ADD CONSTRAINT usage_records_service_check
  CHECK (service IN (
    'anthropic',
    'elevenlabs',
    'assemblyai',
    'remotion_lambda',
    'luma',
    'gemini',
    'fal'
  ));

-- Helper: 24h spend by user across visual providers
CREATE OR REPLACE FUNCTION sum_visual_spend_last_24h_user(p_user_id uuid)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.usage_records
  WHERE user_id = p_user_id
    AND service IN ('luma','gemini','fal')
    AND created_at > now() - INTERVAL '24 hours';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION sum_visual_spend_last_24h_global()
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.usage_records
  WHERE service IN ('luma','gemini','fal')
    AND created_at > now() - INTERVAL '24 hours';
$$ LANGUAGE SQL STABLE;
