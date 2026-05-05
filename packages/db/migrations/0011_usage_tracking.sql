CREATE TABLE usage_records (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('anthropic','elevenlabs','assemblyai','remotion_lambda')),
  units numeric NOT NULL,                      -- tokens, chars, seconds, seconds
  cost_usd numeric NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_usage_user_service_date ON usage_records (user_id, service, created_at DESC);

-- Helper: sum of cost_usd for a user+service in the last 30 days
CREATE OR REPLACE FUNCTION sum_usage_last_30d(p_user_id uuid, p_service text)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM usage_records
  WHERE user_id = p_user_id AND service = p_service
    AND created_at > now() - INTERVAL '30 days';
$$ LANGUAGE SQL STABLE;
