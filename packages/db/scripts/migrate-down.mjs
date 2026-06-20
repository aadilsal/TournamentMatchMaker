import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..');

dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const child = spawn(
  'node-pg-migrate',
  ['down', '--migrations-dir', 'migrations', '--migration-file-language', 'sql'],
  {
    cwd: dbDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  }
);

child.on('exit', (code) => process.exit(code ?? 1));
