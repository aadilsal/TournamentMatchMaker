import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

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

const child = spawn('node', ['--env-file=../../.env', 'scripts/migrate-up.mjs'], {
  cwd: resolve(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
