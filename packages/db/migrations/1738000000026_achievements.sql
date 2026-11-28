-- Up Migration
-- Titles and badges a player has earned.
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(40) NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_code ON user_achievements(code);

-- The title the player chose to show, its resolved text, and when earned badges were last backfilled.
ALTER TABLE users ADD COLUMN IF NOT EXISTS title_code VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_title VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements_synced_at TIMESTAMPTZ;
-- Existing players stay NULL (first sync backfills quietly); new sign-ups are alerted from their first badge.
ALTER TABLE users ALTER COLUMN achievements_synced_at SET DEFAULT NOW();

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS achievements_synced_at;
ALTER TABLE users DROP COLUMN IF EXISTS display_title;
ALTER TABLE users DROP COLUMN IF EXISTS title_code;
DROP TABLE IF EXISTS user_achievements;
