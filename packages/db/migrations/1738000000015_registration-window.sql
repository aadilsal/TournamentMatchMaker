-- Up Migration

-- A tournament had no registration window of its own: the only way to stop new
-- entries was an admin manually flipping the status to 'closed'. Giving it an
-- explicit window lets the lifecycle run itself — registration opens, closes,
-- play starts and the tournament completes on its own schedule.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_opens_at  TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;

-- Existing tournaments: registration has been open since they were created and
-- shuts when play begins, which is how they behaved before this column existed.
-- LEAST(), because a tournament back-dated at creation has a start_date earlier
-- than its created_at and would otherwise open after it closes.
UPDATE tournaments
SET registration_opens_at  = COALESCE(registration_opens_at, LEAST(created_at, start_date)),
    registration_closes_at = COALESCE(registration_closes_at, start_date)
WHERE registration_opens_at IS NULL OR registration_closes_at IS NULL;

-- Back-dated rows can still land on the same instant; nudge them so the window
-- is strictly ordered. Both timestamps are in the past either way, so this only
-- records that registration is long since shut.
UPDATE tournaments
SET registration_closes_at = registration_opens_at + INTERVAL '1 minute'
WHERE registration_closes_at <= registration_opens_at;

-- The lifecycle sweep reads these every minute across every tournament.
CREATE INDEX IF NOT EXISTS idx_tournaments_lifecycle
  ON tournaments (status, registration_opens_at, registration_closes_at, start_date, end_date);

-- Guard the ordering the admin form also enforces, so a direct DB edit or a
-- future code path cannot create a window that the lifecycle cannot resolve.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_registration_window;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_registration_window CHECK (
  registration_opens_at IS NULL
  OR registration_closes_at IS NULL
  OR registration_opens_at < registration_closes_at
);

-- Down Migration

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_registration_window;
DROP INDEX IF EXISTS idx_tournaments_lifecycle;
ALTER TABLE tournaments DROP COLUMN IF EXISTS registration_closes_at;
ALTER TABLE tournaments DROP COLUMN IF EXISTS registration_opens_at;
