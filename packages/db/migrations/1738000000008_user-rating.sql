-- Up Migration
ALTER TABLE users
  ADD COLUMN rating_points INT NOT NULL DEFAULT 650;

-- Recompute skill_tier from rating points for existing users
UPDATE users SET skill_tier = CASE
  WHEN rating_points >= 1700 THEN 5
  WHEN rating_points >= 1200 THEN 4
  WHEN rating_points >= 800 THEN 3
  WHEN rating_points >= 500 THEN 2
  ELSE 1
END;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS rating_points;
