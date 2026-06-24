-- Up Migration
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(100),
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS venue_admins (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, venue_id)
);

CREATE TABLE IF NOT EXISTS tournament_admins (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tournament_id)
);

-- Down Migration
DROP TABLE IF EXISTS tournament_admins;
DROP TABLE IF EXISTS venue_admins;
DROP TABLE IF EXISTS audit_logs;
ALTER TABLE users DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE tournaments DROP COLUMN IF EXISTS updated_at;
