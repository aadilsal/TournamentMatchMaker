-- Up Migration
ALTER TABLE users
  ADD COLUMN profile_picture BYTEA,
  ADD COLUMN profile_picture_mime VARCHAR(50);

ALTER TABLE tournaments
  ADD COLUMN skill_tier SMALLINT NOT NULL DEFAULT 3 CHECK (skill_tier BETWEEN 1 AND 5),
  ADD COLUMN phase VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (phase IN ('normal', 'knockout', 'completed')),
  ADD COLUMN current_round_number INT NOT NULL DEFAULT 1,
  ADD COLUMN buyback_price_cents INT NOT NULL DEFAULT 500;

ALTER TABLE matches
  ADD COLUMN round_number INT,
  ADD COLUMN phase VARCHAR(20) DEFAULT 'normal' CHECK (phase IN ('normal', 'knockout')),
  ADD COLUMN bracket_slot INT;

CREATE TABLE tournament_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tournament_id, round_number)
);

CREATE TABLE tournament_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'advanced', 'knockout', 'out')),
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  buyback_count INT NOT NULL DEFAULT 0,
  round_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX idx_tournament_participants_tournament ON tournament_participants(tournament_id, status);
CREATE INDEX idx_tournament_participants_user ON tournament_participants(user_id);

CREATE TABLE buybacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  amount_cents INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_buybacks_tournament_user ON buybacks(tournament_id, user_id);

-- Down Migration
DROP TABLE IF EXISTS buybacks;
DROP TABLE IF EXISTS tournament_participants;
DROP TABLE IF EXISTS tournament_rounds;
ALTER TABLE matches DROP COLUMN IF EXISTS bracket_slot, DROP COLUMN IF EXISTS phase, DROP COLUMN IF EXISTS round_number;
ALTER TABLE tournaments DROP COLUMN IF EXISTS buyback_price_cents, DROP COLUMN IF EXISTS current_round_number, DROP COLUMN IF EXISTS phase, DROP COLUMN IF EXISTS skill_tier;
ALTER TABLE users DROP COLUMN IF EXISTS profile_picture_mime, DROP COLUMN IF EXISTS profile_picture;
