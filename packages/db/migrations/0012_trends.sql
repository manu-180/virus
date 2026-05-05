CREATE TABLE trends (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  title text NOT NULL,
  url text UNIQUE NOT NULL,
  score numeric NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  category text NOT NULL,
  detected_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX trends_detected_at_idx ON trends (detected_at DESC);
CREATE INDEX trends_category_idx ON trends (category);
CREATE INDEX trends_expires_at_idx ON trends (expires_at);
