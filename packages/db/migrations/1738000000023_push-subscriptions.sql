-- Up Migration
-- Phones that turned on match alerts (Web Push); one row per device.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    VARCHAR(300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Down Migration
DROP TABLE IF EXISTS push_subscriptions;
