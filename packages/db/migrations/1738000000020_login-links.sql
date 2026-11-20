-- Up Migration
-- One-tap sign-in links in emails: only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS login_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_links_user ON login_links(user_id);

-- Down Migration
DROP TABLE IF EXISTS login_links;
