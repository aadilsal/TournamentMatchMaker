-- Up Migration
-- One row per ball the headset reports while an innings is being played.
CREATE TABLE IF NOT EXISTS innings_balls (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq           SMALLINT NOT NULL CHECK (seq BETWEEN 1 AND 120),
  runs          SMALLINT NOT NULL CHECK (runs BETWEEN 0 AND 6),
  is_wicket     BOOLEAN NOT NULL DEFAULT FALSE,
  total_runs    SMALLINT NOT NULL CHECK (total_runs BETWEEN 0 AND 999),
  wickets_lost  SMALLINT NOT NULL CHECK (wickets_lost >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, user_id, seq)
);

-- Down Migration
DROP TABLE IF EXISTS innings_balls;
