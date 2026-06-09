-- Up Migration
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  username        VARCHAR(50) UNIQUE NOT NULL,
  country         VARCHAR(100),
  city            VARCHAR(100),
  has_vr_headset  BOOLEAN DEFAULT FALSE,
  vr_device_type  VARCHAR(100),
  skill_tier      SMALLINT DEFAULT 3 CHECK (skill_tier BETWEEN 1 AND 5),
  role            VARCHAR(30) DEFAULT 'player',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Down Migration
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
