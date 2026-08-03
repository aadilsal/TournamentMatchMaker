-- Up Migration

-- Per-round play window. Every tournament entry now owns a slot: non-VR players
-- also hold a venue booking for it, VR players play from home so booking_id and
-- venue_id stay NULL. Without this a VR-vs-VR match had no time_slot_id at all,
-- which left it with no playable window.
CREATE TABLE IF NOT EXISTS tournament_round_slots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_number  INT NOT NULL,
  time_slot_id  UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
  venue_id      UUID REFERENCES venues(id) ON DELETE SET NULL,
  booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_round_slots_user
  ON tournament_round_slots(user_id, tournament_id, round_number DESC);
CREATE INDEX IF NOT EXISTS idx_round_slots_slot
  ON tournament_round_slots(time_slot_id);

-- Backfill from the registration booking so players mid-tournament keep a slot.
INSERT INTO tournament_round_slots (tournament_id, user_id, round_number, time_slot_id, venue_id, booking_id)
SELECT tr.tournament_id,
       tr.user_id,
       COALESCE(tp.round_number, 1),
       b.time_slot_id,
       ts.venue_id,
       b.id
FROM tournament_registrations tr
JOIN bookings b ON b.id = tr.booking_id AND b.status = 'confirmed'
JOIN time_slots ts ON ts.id = b.time_slot_id
LEFT JOIN tournament_participants tp
       ON tp.tournament_id = tr.tournament_id AND tp.user_id = tr.user_id
ON CONFLICT (tournament_id, user_id, round_number) DO NOTHING;

-- A player may only be live in one tournament at a time. Retire any older
-- duplicate participation first so the constraint can be created on real data:
-- the most recently updated row wins.
UPDATE tournament_participants tp
SET status = 'out', updated_at = NOW()
WHERE tp.status IN ('active', 'advanced', 'knockout')
  AND EXISTS (
    SELECT 1 FROM tournament_participants other
    WHERE other.user_id = tp.user_id
      AND other.id <> tp.id
      AND other.status IN ('active', 'advanced', 'knockout')
      AND (other.updated_at, other.id) > (tp.updated_at, tp.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_tournament_per_user
  ON tournament_participants(user_id)
  WHERE status IN ('active', 'advanced', 'knockout');

-- Down Migration
DROP INDEX IF EXISTS idx_one_live_tournament_per_user;
DROP TABLE IF EXISTS tournament_round_slots;
