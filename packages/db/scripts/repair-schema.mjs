import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const hasLat = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'latitude'`
  );
  if (hasLat.rows.length === 0) {
    await client.query(`
      ALTER TABLE users
        ADD COLUMN latitude DOUBLE PRECISION,
        ADD COLUMN longitude DOUBLE PRECISION
    `);
    console.log('Added latitude/longitude to users');
  } else {
    console.log('latitude/longitude already exist');
  }

  const hasRating = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'rating_points'`
  );
  if (hasRating.rows.length === 0) {
    await client.query(`
      ALTER TABLE users ADD COLUMN rating_points INT NOT NULL DEFAULT 650
    `);
    await client.query(`
      UPDATE users SET skill_tier = CASE
        WHEN rating_points >= 1700 THEN 5
        WHEN rating_points >= 1200 THEN 4
        WHEN rating_points >= 800 THEN 3
        WHEN rating_points >= 500 THEN 2
        ELSE 1
      END
    `);
    console.log('Added rating_points to users');
  } else {
    console.log('rating_points already exists');
  }

  const hasProfilePic = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'profile_picture'`
  );
  if (hasProfilePic.rows.length === 0) {
    await client.query(`
      ALTER TABLE users
        ADD COLUMN profile_picture BYTEA,
        ADD COLUMN profile_picture_mime VARCHAR(50)
    `);
    console.log('Added profile_picture columns to users');
  }

  const hasTournamentPhase = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tournaments' AND column_name = 'phase'`
  );
  if (hasTournamentPhase.rows.length === 0) {
    await client.query(`
      ALTER TABLE tournaments
        ADD COLUMN skill_tier SMALLINT NOT NULL DEFAULT 3 CHECK (skill_tier BETWEEN 1 AND 5),
        ADD COLUMN phase VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (phase IN ('normal', 'knockout', 'completed')),
        ADD COLUMN current_round_number INT NOT NULL DEFAULT 1,
        ADD COLUMN buyback_price_cents INT NOT NULL DEFAULT 500
    `);
    console.log('Added tournament phase/round columns');
  }

  const hasMatchRound = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'matches' AND column_name = 'round_number'`
  );
  if (hasMatchRound.rows.length === 0) {
    await client.query(`
      ALTER TABLE matches
        ADD COLUMN round_number INT,
        ADD COLUMN phase VARCHAR(20) DEFAULT 'normal' CHECK (phase IN ('normal', 'knockout')),
        ADD COLUMN bracket_slot INT
    `);
    console.log('Added match round/phase columns');
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS tournament_rounds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tournament_id, round_number)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'advanced', 'knockout', 'out')),
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      buyback_count INT NOT NULL DEFAULT 0,
      round_number INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tournament_id, user_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS buybacks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INT NOT NULL,
      match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
      amount_cents INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS pgmigrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      run_on TIMESTAMPTZ NOT NULL
    )
  `);

  const orderedMigrations = [
    '1738000000006_user-location',
    '1738000000007_tournament-rounds-and-profiles',
    '1738000000008_user-rating',
  ];

  const { rows: recorded } = await client.query(
    'SELECT id, name FROM pgmigrations ORDER BY id'
  );
  const recordedNames = recorded.map((row) => row.name);
  const expectedPrefix = [
    '1738000000001_extensions-and-users',
    '1738000000002_venues',
    '1738000000003_time-slots-and-bookings',
    '1738000000004_tournaments-and-matches',
    '1738000000005_notifications',
    ...orderedMigrations,
  ];
  const orderBroken =
    recordedNames.length >= expectedPrefix.length &&
    expectedPrefix.some((name, index) => recordedNames[index] !== name);

  if (orderBroken) {
    await client.query(
      `DELETE FROM pgmigrations WHERE name = ANY($1::text[])`,
      [orderedMigrations]
    );
    for (const name of orderedMigrations) {
      await client.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [name]);
    }
    console.log('Reordered pgmigrations entries for migrations 6–8');
  } else {
    for (const name of orderedMigrations) {
      const exists = await client.query('SELECT 1 FROM pgmigrations WHERE name = $1', [name]);
      if (exists.rows.length === 0) {
        await client.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [name]);
        console.log('Recorded migration:', name);
      }
    }
  }

  await client.query('COMMIT');
  console.log('Schema repair complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
