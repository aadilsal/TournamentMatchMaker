-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. One innings per player per match, enforced by the database.
-- ---------------------------------------------------------------------------
--
-- "This player has already batted" used to be inferred, never recorded. The
-- only evidence was `matches.result` — the filled score half, plus
-- `chaseTarget`/`chasePlayerId` for the target-setter — and the setter's own
-- authoritative record, `tournament_participants.solo_target`, is deleted by
-- pairing the instant the match is created.
--
-- So a match paired without its chase fields (the queue hash that pairing reads
-- had lost `hasPlayedSolo`, and pairing has no database fallback) carried no
-- trace that one player had already played. That player's score half was still
-- null, `getCurrentMatch` computed `amChasing` for them off the empty half, and
-- they were invited to bat a second time — now knowing the score to beat.
--
-- This table is that missing record, and the primary key is the guarantee: a
-- second innings is a constraint violation, not a check someone can forget to
-- write.
CREATE TABLE IF NOT EXISTS match_innings (
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  -- 'solo' — played before pairing, carried in as the chase target.
  -- 'meta'  — submitted from the headset inside this match.
  -- 'bot'   — generated for a bot opponent.
  source     VARCHAR(20) NOT NULL DEFAULT 'meta',
  played_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_innings_user ON match_innings(user_id);

-- Backfill from the scorelines already on the board, so matches that are open
-- right now inherit the guard instead of starting exempt from it.
INSERT INTO match_innings (match_id, user_id, score, source, played_at)
SELECT m.id, m.player1_id, (m.result->>'player1Score')::INTEGER, 'meta', m.updated_at
FROM matches m
WHERE m.result->>'player1Score' IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO match_innings (match_id, user_id, score, source, played_at)
SELECT m.id, m.player2_id, (m.result->>'player2Score')::INTEGER, 'meta', m.updated_at
FROM matches m
WHERE m.result->>'player2Score' IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The turn lock — only one player may be batting in a match at a time.
-- ---------------------------------------------------------------------------
--
-- Both players share a play window, so both could enter at once and bat blind:
-- neither had a target, and whoever submitted second was chasing a number they
-- had never been shown. The match is now held by one player at a time. The
-- holder bats and sets the target; the other is told to wait and then chases a
-- real number.
--
-- `active_player_since` is what stops a holder who walks away from locking the
-- other player out for the rest of the round: the hold lapses and the match is
-- claimable again.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS active_player_id    UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS active_player_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_active_player ON matches(active_player_id) WHERE active_player_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Bot players.
-- ---------------------------------------------------------------------------
--
-- An odd field leaves one player with nobody to play. A bye hands them a free
-- pass they did not earn; making them wait hands them nothing at all. Instead
-- they get an opponent — a bot carrying an ordinary username, so the match
-- reads like any other, and the flag below so the admin panel can always tell
-- what it really is.
--
-- The bot is the last resort. Real opponents are always preferred, and the
-- fallback only fires near the end of the round, once waiting can no longer
-- produce a human.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- One bot per tournament, so the same username never turns up twice in a
-- player's history and each tournament's bot has its own identity.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bot_tournament
  ON users(bot_tournament_id) WHERE bot_tournament_id IS NOT NULL;

-- A bot is never a login. Guard it here as well as in code so no auth path can
-- be talked into treating one as a real account.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bot_has_tournament;
ALTER TABLE users ADD CONSTRAINT users_bot_has_tournament CHECK (
  (is_bot = FALSE AND bot_tournament_id IS NULL) OR (is_bot = TRUE AND bot_tournament_id IS NOT NULL)
);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bot_has_tournament;
DROP INDEX IF EXISTS idx_users_bot_tournament;
ALTER TABLE users DROP COLUMN IF EXISTS bot_tournament_id;
ALTER TABLE users DROP COLUMN IF EXISTS is_bot;

DROP INDEX IF EXISTS idx_matches_active_player;
ALTER TABLE matches DROP COLUMN IF EXISTS active_player_since;
ALTER TABLE matches DROP COLUMN IF EXISTS active_player_id;

DROP INDEX IF EXISTS idx_match_innings_user;
DROP TABLE IF EXISTS match_innings;
