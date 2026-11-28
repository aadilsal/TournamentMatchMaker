-- Up Migration
-- New players start in Tier 1 at 300 points; existing rows are untouched.
ALTER TABLE users ALTER COLUMN rating_points SET DEFAULT 300;
ALTER TABLE users ALTER COLUMN skill_tier SET DEFAULT 1;

-- Down Migration
ALTER TABLE users ALTER COLUMN rating_points SET DEFAULT 650;
ALTER TABLE users ALTER COLUMN skill_tier SET DEFAULT 3;
