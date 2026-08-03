-- Up Migration

-- A knockout bracket slot is created as soon as the FIRST feeder match resolves,
-- with the other side still undecided. Both player columns were NOT NULL, so
-- that INSERT always raised 23502 and no next-round match could ever be created
-- — every knockout completion 500'd and the bracket could not advance past its
-- first round.
ALTER TABLE matches ALTER COLUMN player1_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN player2_id DROP NOT NULL;

-- Only a bracket slot waiting on a feeder result may be half-empty; anything
-- else with a missing player is a bug we want to fail loudly.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_players_present;
ALTER TABLE matches ADD CONSTRAINT matches_players_present CHECK (
  (player1_id IS NOT NULL AND player2_id IS NOT NULL)
  OR (phase = 'knockout' AND status = 'pending_confirmation')
);

-- One bracket slot per round: two semi-finals finishing at the same instant both
-- read "no final yet" and each inserted one, splitting the bracket in two.
-- The unique index makes the second insert fail so it falls through to the
-- update path instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_bracket_slot
  ON matches (tournament_id, round_number, bracket_slot)
  WHERE phase = 'knockout' AND bracket_slot IS NOT NULL;

-- Registration stored the address as typed while availability checks compared
-- case-insensitively, so "A@x.com" could register alongside "a@x.com".
UPDATE users u SET email = LOWER(u.email)
WHERE u.email <> LOWER(u.email)
  AND NOT EXISTS (
    SELECT 1 FROM users o WHERE o.id <> u.id AND LOWER(o.email) = LOWER(u.email)
  );

-- Whatever is left is two real accounts sharing one address. Merging or
-- deleting an account is a judgement call about someone's data, not something a
-- migration should decide, so stop and name them instead of guessing.
DO $$
DECLARE conflicts TEXT;
BEGIN
  SELECT string_agg(DISTINCT LOWER(email), ', ') INTO conflicts
  FROM users
  WHERE LOWER(email) IN (SELECT LOWER(email) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1);

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce unique emails: several accounts share an address (case-insensitively): %. Resolve these accounts, then re-run the migration.',
      conflicts;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));

-- Down Migration

DROP INDEX IF EXISTS idx_users_username_lower;
DROP INDEX IF EXISTS idx_users_email_lower;
DROP INDEX IF EXISTS idx_matches_bracket_slot;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_players_present;
ALTER TABLE matches ALTER COLUMN player2_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN player1_id SET NOT NULL;
