-- Unified tournament flow: drop format enum, add round duration and field size tracking

ALTER TABLE tournaments
  ADD COLUMN round_duration_minutes INT NOT NULL DEFAULT 180,
  ADD COLUMN initial_player_count INT;

ALTER TABLE tournaments DROP COLUMN format;

DROP TYPE tournament_format;

-- migrate:down
-- CREATE TYPE tournament_format AS ENUM ('single_elimination', 'double_elimination', 'round_robin');
-- ALTER TABLE tournaments ADD COLUMN format tournament_format NOT NULL DEFAULT 'single_elimination';
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS round_duration_minutes;
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS initial_player_count;
