import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');

/**
 * Schema markers used to detect migrations already applied outside pgmigrations.
 *
 * EVERY migration file needs an entry. A migration with no marker here can never
 * be recognised as already-applied, so baselining silently skips it and
 * `migrate:up` then re-runs its DDL against a schema that already has it —
 * failing with "column ... already exists". `assertMarkersCoverMigrations`
 * below turns that into a loud error instead of a confusing migration crash.
 */
const MIGRATION_MARKERS = {
  '1738000000001_extensions-and-users': { table: 'users' },
  '1738000000002_venues': { table: 'venues' },
  '1738000000003_time-slots-and-bookings': { table: 'time_slots' },
  '1738000000004_tournaments-and-matches': { table: 'tournaments' },
  '1738000000005_notifications': { table: 'notifications' },
  '1738000000006_user-location': { column: { table: 'users', name: 'latitude' } },
  '1738000000007_tournament-rounds-and-profiles': {
    column: { table: 'users', name: 'profile_picture' },
  },
  '1738000000008_user-rating': { column: { table: 'users', name: 'rating_points' } },
  '1738000000009_meta-stripe-solo': {
    column: { table: 'buybacks', name: 'stripe_payment_intent_id' },
  },
  '1738000000010_admin-support': { table: 'audit_logs' },
  '1738000000011_tournament-flow': {
    column: { table: 'tournaments', name: 'round_duration_minutes' },
  },
  '1738000000012_round-slots-and-live-participation': { table: 'tournament_round_slots' },
  // Adds no table or column of its own — only indexes and constraints — so it
  // is detected by one of the indexes it creates.
  '1738000000013_knockout-bracket-and-email-case': { index: 'idx_users_email_lower' },
};

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return !!rows[0]?.exists;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return !!rows[0]?.exists;
}

async function indexExists(client, index) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1
     ) AS exists`,
    [index]
  );
  return !!rows[0]?.exists;
}

async function migrationAlreadyApplied(client, name) {
  const marker = MIGRATION_MARKERS[name];
  if (!marker) return false;
  if (marker.table) return tableExists(client, marker.table);
  if (marker.column) return columnExists(client, marker.column.table, marker.column.name);
  if (marker.index) return indexExists(client, marker.index);
  return false;
}

/**
 * Fails fast when a migration has been added without a marker, rather than
 * letting baselining skip it and `migrate:up` die on duplicate DDL later.
 */
function assertMarkersCoverMigrations(files) {
  const missing = files
    .map((file) => file.replace(/\.sql$/, ''))
    .filter((name) => !MIGRATION_MARKERS[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing MIGRATION_MARKERS entries for:\n  ${missing.join('\n  ')}\n` +
        'Add a table/column marker for each in scripts/migration-baseline.mjs — ' +
        'without one, an existing database cannot be baselined and migrate:up ' +
        'will try to re-apply the migration.'
    );
  }
}

export async function baselineExistingSchema(client) {
  const usersExists = await tableExists(client, 'users');
  if (!usersExists) {
    return { baselined: 0 };
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS pgmigrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      run_on TIMESTAMPTZ NOT NULL
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  assertMarkersCoverMigrations(files);

  let baselined = 0;

  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    const recorded = await client.query('SELECT 1 FROM pgmigrations WHERE name = $1', [name]);
    if (recorded.rows.length > 0) continue;

    if (await migrationAlreadyApplied(client, name)) {
      await client.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [name]);
      baselined++;
      console.log(`> Baseline: marked ${name} as already applied`);
    }
  }

  return { baselined };
}
