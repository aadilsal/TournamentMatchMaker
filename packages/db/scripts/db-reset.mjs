import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

/**
 * This script drops tables outright. It reads whatever DATABASE_URL happens to
 * be in .env — the same file that has held production-shaped credentials before
 * — so it refuses to run unless the target clearly looks like a local dev
 * database. Set DB_RESET_I_KNOW_WHAT_IM_DOING=yes to override deliberately.
 */
function assertLocalDatabase(url) {
  if (!url) {
    console.error('DATABASE_URL is not set — refusing to run.');
    process.exit(1);
  }
  if (process.env.DB_RESET_I_KNOW_WHAT_IM_DOING === 'yes') {
    console.warn('WARNING: local-database check overridden. Dropping tables in 3 seconds…');
    return;
  }

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`DATABASE_URL is not a valid URL — refusing to run.`);
    process.exit(1);
  }

  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];
  if (!LOCAL_HOSTS.includes(host)) {
    console.error(
      `Refusing to reset a non-local database.\n` +
        `  DATABASE_URL host: ${host}\n` +
        `  Allowed hosts:     ${LOCAL_HOSTS.join(', ')}\n\n` +
        `If you really mean it, re-run with DB_RESET_I_KNOW_WHAT_IM_DOING=yes`
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('NODE_ENV=production — refusing to reset.');
    process.exit(1);
  }
}

assertLocalDatabase(process.env.DATABASE_URL);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function reset() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS bookings CASCADE');
    await client.query('DROP TABLE IF EXISTS time_slots CASCADE');
    await client.query('DROP TYPE IF EXISTS booking_status CASCADE');
    await client.query('DROP TYPE IF EXISTS slot_status CASCADE');
    await client.query('DROP TABLE IF EXISTS venues CASCADE');
    await client.query('DROP TABLE IF EXISTS refresh_tokens CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TABLE IF EXISTS pgmigrations CASCADE');
    await client.query('COMMIT');
    console.log('Database reset complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

await reset();

const child = spawn('node', ['scripts/migrate-up.mjs'], {
  cwd: resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
