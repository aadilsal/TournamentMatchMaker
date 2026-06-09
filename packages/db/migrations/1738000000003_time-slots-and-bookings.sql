-- Up Migration
CREATE TYPE slot_status AS ENUM ('available', 'full', 'locked');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE time_slots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id      UUID REFERENCES venues(id) ON DELETE CASCADE,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  max_capacity  INT NOT NULL,
  booked_count  INT NOT NULL DEFAULT 0,
  status        slot_status DEFAULT 'available',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id, start_time)
);

CREATE TABLE bookings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id),
  time_slot_id UUID REFERENCES time_slots(id),
  status       booking_status DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, time_slot_id)
);

CREATE INDEX idx_bookings_user ON bookings(user_id, created_at DESC);
CREATE INDEX idx_slots_venue_date ON time_slots(venue_id, start_time);

-- Down Migration
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS time_slots;
DROP TYPE IF EXISTS booking_status;
DROP TYPE IF EXISTS slot_status;
