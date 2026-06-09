-- Up Migration
CREATE TYPE tournament_status AS ENUM ('draft', 'open', 'closed', 'in_progress', 'completed');
CREATE TYPE tournament_format AS ENUM ('single_elimination', 'double_elimination', 'round_robin');
CREATE TYPE match_status AS ENUM (
  'pending_confirmation', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  game VARCHAR(100) NOT NULL,
  format tournament_format NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status tournament_status DEFAULT 'draft',
  max_players INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tournament_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  player1_id UUID REFERENCES users(id) NOT NULL,
  player2_id UUID REFERENCES users(id) NOT NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  time_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL,
  status match_status DEFAULT 'pending_confirmation',
  result JSONB,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matches_tournament_status ON matches(tournament_id, status);
CREATE INDEX idx_matches_player1 ON matches(player1_id, created_at DESC);
CREATE INDEX idx_matches_player2 ON matches(player2_id, created_at DESC);
CREATE INDEX idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);

-- Down Migration
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS tournament_registrations;
DROP TABLE IF EXISTS tournaments;
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS tournament_format;
DROP TYPE IF EXISTS tournament_status;
