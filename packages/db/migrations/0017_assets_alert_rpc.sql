-- ============================================================
-- 0017: RPC for assets failure-rate monitoring
-- ============================================================
--
-- Used by the Inngest scheduled function monitor-assets-failure-rate
-- (runs every 15min). Computes the % of slots that failed in the
-- last N minutes. If >20% with at least 10 events, an alert is logged
-- in job_events with step='monitoring.assets_high_failure'.

CREATE OR REPLACE FUNCTION compute_assets_failure_rate(window_minutes int DEFAULT 60)
RETURNS TABLE(total int, failed int, rate numeric) AS $$
  WITH evts AS (
    SELECT step
    FROM public.job_events
    WHERE created_at > now() - (window_minutes || ' minutes')::interval
      AND step IN ('assets.generated', 'assets.failed')
  )
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE step = 'assets.failed')::int AS failed,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND((COUNT(*) FILTER (WHERE step = 'assets.failed'))::numeric / COUNT(*), 4)
    END AS rate
  FROM evts;
$$ LANGUAGE SQL STABLE;
