-- Up Migration

-- Book, cancel, rebook: a cancelled row must not block a new booking for the same slot.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_time_slot_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_user_slot_live
  ON bookings(user_id, time_slot_id) WHERE status <> 'cancelled';

-- The match a booking was created for, so declining that match can release it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id) ON DELETE SET NULL;

-- Counters derived from bookings can no longer run negative or past capacity.
UPDATE time_slots SET booked_count = LEAST(GREATEST(booked_count, 0), max_capacity)
WHERE booked_count < 0 OR booked_count > max_capacity;
ALTER TABLE time_slots DROP CONSTRAINT IF EXISTS time_slots_booked_count_range;
ALTER TABLE time_slots ADD CONSTRAINT time_slots_booked_count_range
  CHECK (booked_count >= 0 AND booked_count <= max_capacity);

-- One open checkout per player per tournament; older duplicates are retired first.
UPDATE buybacks b SET status = 'failed'
WHERE b.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM buybacks n
    WHERE n.user_id = b.user_id AND n.tournament_id = b.tournament_id AND n.status = 'pending'
      AND (n.created_at, n.id) > (b.created_at, b.id)
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_buybacks_one_pending
  ON buybacks(user_id, tournament_id) WHERE status = 'pending';

-- Set once the payment has been returned; status stays 'failed' as before.
ALTER TABLE buybacks ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE buybacks DROP COLUMN IF EXISTS refunded_at;
DROP INDEX IF EXISTS idx_buybacks_one_pending;
ALTER TABLE time_slots DROP CONSTRAINT IF EXISTS time_slots_booked_count_range;
ALTER TABLE bookings DROP COLUMN IF EXISTS match_id;
DROP INDEX IF EXISTS idx_bookings_user_slot_live;
ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_time_slot_id_key UNIQUE (user_id, time_slot_id);
