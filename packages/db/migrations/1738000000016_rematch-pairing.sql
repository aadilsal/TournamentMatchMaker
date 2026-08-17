-- Up Migration

-- A drawn match is replayed by the same two players and nobody else.
--
-- The queue cannot express that on its own: it scores whoever happens to be
-- waiting, so a player coming back after a draw could be handed a stranger
-- while the opponent they actually drew with was still picking a window. This
-- table is the standing instruction — these two, this round — and it outlives
-- both queue entries, which is the point: the two sides re-enter minutes apart.
--
-- It also records *who came back*. Each side stores the window it picked after
-- the draw, so a rematch that never happens can still be settled at round close
-- in favour of the player who did their part, the same way an abandoned match
-- is settled by walkover.
CREATE TABLE IF NOT EXISTS tournament_rematches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number    INT NOT NULL,
  source_match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  match_id        UUID REFERENCES matches(id) ON DELETE SET NULL,
  player1_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player1_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL,
  player2_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tournament_rematches_status_check
    CHECK (status IN ('pending', 'paired', 'expired')),
  CONSTRAINT tournament_rematches_distinct_players
    CHECK (player1_id <> player2_id)
);

-- One rematch per drawn match, however many times the resolution path is
-- retried: a score submission that fails after the cancel and is replayed must
-- not leave the pair owing two rematches.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rematches_source
  ON tournament_rematches(source_match_id);

-- The lookup every tournament entry makes: does this player owe a rematch?
CREATE INDEX IF NOT EXISTS idx_rematches_pending_player1
  ON tournament_rematches(player1_id, tournament_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rematches_pending_player2
  ON tournament_rematches(player2_id, tournament_id) WHERE status = 'pending';

-- The lookup round close makes over everything still owed in the round.
CREATE INDEX IF NOT EXISTS idx_rematches_round
  ON tournament_rematches(tournament_id, round_number) WHERE status = 'pending';

-- Down Migration
DROP TABLE IF EXISTS tournament_rematches;
