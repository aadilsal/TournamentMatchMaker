import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');

/** Schema markers used to detect migrations already applied outside pgmigrations. */
const MIGRATION_MARKERS = {
  '1738000000001_extensions-and-users': { table: 'users' },
  '1738000000002_venues': { table: 'venues' },
  '1738000000003_time-slots-and-bookings': { table: 'time_slots' },
  '1738000000004_tournaments-and-matches': { table: 'tournaments' },
  '1738000000005_notifications': { table: 'notifications' },
  '1738000000006_user-location': { column: { table: 'users', name: 'latitude' } },
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

async function migrationAlreadyApplied(client, name) {
  const marker = MIGRATION_MARKERS[name];
  if (!marker) return false;
  if (marker.table) return tableExists(client, marker.table);
  if (marker.column) return columnExists(client, marker.column.table, marker.column.name);
  return false;
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
