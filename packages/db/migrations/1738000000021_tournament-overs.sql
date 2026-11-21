-- Up Migration
-- Overs per innings, set per tournament (1-20); existing tournaments stay one over.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS overs SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_overs_range;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_overs_range CHECK (overs BETWEEN 1 AND 20);

-- Balls the headset says the batter faced; recorded for checking, never used to judge a score.
ALTER TABLE match_innings ADD COLUMN IF NOT EXISTS balls_faced SMALLINT;

-- Down Migration
ALTER TABLE match_innings DROP COLUMN IF EXISTS balls_faced;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_overs_range;
ALTER TABLE tournaments DROP COLUMN IF EXISTS overs;
