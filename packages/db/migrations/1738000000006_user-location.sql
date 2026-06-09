-- Up Migration
ALTER TABLE users
  ADD COLUMN latitude DOUBLE PRECISION,
  ADD COLUMN longitude DOUBLE PRECISION;

-- Down Migration
ALTER TABLE users
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;
