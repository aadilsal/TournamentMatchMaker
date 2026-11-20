-- Up Migration

-- New tournaments use draw-based rounds; existing ones keep the classic queue rules.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS play_format VARCHAR(20) NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS champion_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_play_format_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_play_format_check CHECK (play_format IN ('classic', 'draw'));

-- 'draw' phase keeps classic jobs (which select phase normal/knockout) away from draw tournaments.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_phase_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_phase_check CHECK (phase IN ('normal', 'knockout', 'completed', 'draw'));
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_phase_check;
ALTER TABLE matches ADD CONSTRAINT matches_phase_check CHECK (phase IN ('normal', 'knockout', 'draw'));

-- One match per bracket position per draw round.
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_draw_slot
  ON matches (tournament_id, round_number, bracket_slot)
  WHERE phase = 'draw';

-- Where a player plays a tournament: a venue, or at home on their own headset.
ALTER TABLE tournament_registrations
  ADD COLUMN IF NOT EXISTS play_location VARCHAR(10),
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
ALTER TABLE tournament_registrations DROP CONSTRAINT IF EXISTS registrations_play_location_check;
ALTER TABLE tournament_registrations ADD CONSTRAINT registrations_play_location_check CHECK (
  play_location IS NULL
  OR (play_location = 'home' AND venue_id IS NULL)
  OR (play_location = 'venue' AND venue_id IS NOT NULL)
);

-- Players may be live in several tournaments; classic entry still checks this in code.
DROP INDEX IF EXISTS idx_one_live_tournament_per_user;

-- Down Migration

ALTER TABLE tournament_registrations DROP CONSTRAINT IF EXISTS registrations_play_location_check;
ALTER TABLE tournament_registrations DROP COLUMN IF EXISTS venue_id, DROP COLUMN IF EXISTS play_location;
DROP INDEX IF EXISTS idx_matches_draw_slot;
DELETE FROM matches WHERE phase = 'draw';
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_phase_check;
ALTER TABLE matches ADD CONSTRAINT matches_phase_check CHECK (phase IN ('normal', 'knockout'));
UPDATE tournaments SET phase = 'completed' WHERE phase = 'draw';
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_phase_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_phase_check CHECK (phase IN ('normal', 'knockout', 'completed'));
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_play_format_check;
ALTER TABLE tournaments DROP COLUMN IF EXISTS champion_id, DROP COLUMN IF EXISTS play_format;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_tournament_per_user
  ON tournament_participants(user_id)
  WHERE status IN ('active', 'advanced', 'knockout');
