-- Up Migration
CREATE TYPE notification_channel AS ENUM ('in_app', 'email');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  channel notification_channel NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  status notification_status DEFAULT 'pending',
  idempotency_key VARCHAR(100),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS notifications;
DROP TYPE IF EXISTS notification_status;
DROP TYPE IF EXISTS notification_channel;
