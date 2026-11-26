-- Up Migration
-- Batting breakdown sent by the headset; null when it was not sent (older innings, bots).
ALTER TABLE match_innings ADD COLUMN IF NOT EXISTS fours SMALLINT;
ALTER TABLE match_innings ADD COLUMN IF NOT EXISTS sixes SMALLINT;
ALTER TABLE match_innings ADD COLUMN IF NOT EXISTS wickets_lost SMALLINT;

-- An innings the batter started (POST /start); one per player per match, kept alive by heartbeats.
CREATE TABLE IF NOT EXISTS innings_attempts (
  match_id           UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, user_id)
);

-- Down Migration
DROP TABLE IF EXISTS innings_attempts;
ALTER TABLE match_innings DROP COLUMN IF EXISTS wickets_lost;
ALTER TABLE match_innings DROP COLUMN IF EXISTS sixes;
ALTER TABLE match_innings DROP COLUMN IF EXISTS fours;
