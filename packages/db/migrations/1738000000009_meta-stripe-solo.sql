-- Up Migration
ALTER TABLE buybacks
  ADD COLUMN stripe_payment_intent_id VARCHAR(255);

CREATE UNIQUE INDEX idx_buybacks_stripe_pi ON buybacks(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE matches
  ADD COLUMN rematch_of_match_id UUID REFERENCES matches(id) ON DELETE SET NULL;

ALTER TABLE tournament_participants
  ADD COLUMN solo_target INT,
  ADD COLUMN solo_played_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE tournament_participants DROP COLUMN IF EXISTS solo_played_at, DROP COLUMN IF EXISTS solo_target;
ALTER TABLE matches DROP COLUMN IF EXISTS rematch_of_match_id;
DROP INDEX IF EXISTS idx_buybacks_stripe_pi;
ALTER TABLE buybacks DROP COLUMN IF EXISTS stripe_payment_intent_id;
