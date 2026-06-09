import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { resolve } from 'path';

dotenv.config({ path: resolve(import.meta.dirname, '../../../.env'), override: true });
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..');

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
