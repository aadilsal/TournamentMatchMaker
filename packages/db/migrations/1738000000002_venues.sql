-- Up Migration
CREATE TABLE venues (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  address    TEXT NOT NULL,
  city       VARCHAR(100) NOT NULL,
  country    VARCHAR(100) NOT NULL,
  location   GEOMETRY(POINT, 4326) NOT NULL,
  capacity   INT NOT NULL DEFAULT 10,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_venues_location ON venues USING GIST(location);
CREATE INDEX idx_venues_city ON venues(city, country);

-- Down Migration
DROP TABLE IF EXISTS venues;
