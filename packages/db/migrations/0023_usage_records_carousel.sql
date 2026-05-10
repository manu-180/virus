-- ============================================================
-- 0023: Carousel cost tracking in usage_records
-- ============================================================
--
-- Adds:
--   1. GIN index on metadata for efficient carousel cost queries
--      (carousel functions store carouselId in metadata jsonb)
--   2. RPC: sum_carousel_spend_this_month(user_id) — aggregates
--      all usage_records this month where metadata has carouselId.
--   3. RPC: sum_carousel_spend_for_carousel(user_id, carousel_id)
--      — breakdown for a single carousel detail view.

CREATE INDEX IF NOT EXISTS idx_usage_records_metadata_carousel
  ON public.usage_records USING GIN (metadata);

-- Helper: total carousel AI spend for a user this calendar month
CREATE OR REPLACE FUNCTION sum_carousel_spend_this_month(p_user_id uuid)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.usage_records
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', now())
    AND metadata IS NOT NULL
    AND (metadata->>'carouselId') IS NOT NULL;
$$ LANGUAGE SQL STABLE;

-- Helper: total cost + per-provider breakdown for one carousel
CREATE OR REPLACE FUNCTION get_carousel_cost(p_carousel_id text)
RETURNS TABLE (
  service       text,
  total_usd     numeric,
  record_count  bigint
) AS $$
  SELECT service,
         SUM(cost_usd) AS total_usd,
         COUNT(*)      AS record_count
  FROM public.usage_records
  WHERE metadata IS NOT NULL
    AND metadata->>'carouselId' = p_carousel_id
  GROUP BY service;
$$ LANGUAGE SQL STABLE;
