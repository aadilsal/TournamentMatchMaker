import dotenv from 'dotenv';
import pg from 'pg';
import { spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { baselineExistingSchema } from './migration-baseline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..');

dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const client = await pool.connect();
  try {
    const { baselined } = await baselineExistingSchema(client);
    if (baselined > 0) {
      console.log(`> Recorded ${baselined} existing migration(s); running pending migrations only`);
    }
  } finally {
    client.release();
  }
} catch (err) {
  console.error('Pre-migration baseline failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

const child = spawn(
  'node-pg-migrate',
  ['up', '--migrations-dir', 'migrations', '--migration-file-language', 'sql'],
  {
    cwd: dbDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  }
);

child.on('exit', (code) => process.exit(code ?? 1));
