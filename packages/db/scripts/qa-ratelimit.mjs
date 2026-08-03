/** Confirms the credential limiter stops attackers without locking out a venue. */
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const API = 'http://localhost:3000/api/v1';
const redis = new Redis(process.env.REDIS_URL);
const PW = 'password123';

const login = (email, password) =>
  fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.status);

const reset = async () => {
  const keys = await redis.keys('ratelimit:auth:*');
  if (keys.length) await redis.del(...keys);
};

const tag = randomUUID().slice(0, 8);

// A real cohort: 25 distinct players logging in correctly from one venue IP.
await reset();
const players = [];
for (let i = 0; i < 25; i++) {
  const email = `rl${i}_${tag}@qa.test`;
  await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, username: `rl${i}_${tag}` }),
  });
  players.push(email);
}
await reset(); // registration spent budget; measure the login burst on its own

let blocked = 0;
for (const email of players) if ((await login(email, PW)) === 429) blocked++;
console.log(`\n25 genuine logins from one venue IP → ${blocked} blocked  ${blocked === 0 ? '\x1b[32mOK\x1b[0m' : '\x1b[31mLOCKOUT\x1b[0m'}`);

// Brute force against ONE account.
await reset();
let tries = 0, limited = false;
for (let i = 0; i < 40; i++) {
  tries++;
  if ((await login(players[0], `wrong${i}`)) === 429) { limited = true; break; }
}
console.log(`Brute force one account → blocked after ${tries} attempts  ${limited ? '\x1b[32mOK\x1b[0m' : '\x1b[31mUNLIMITED\x1b[0m'}`);

// Password spray: one guess each across many accounts from one IP.
await reset();
tries = 0; limited = false;
for (let i = 0; i < 80; i++) {
  tries++;
  if ((await login(`spray${i}_${tag}@qa.test`, 'guess')) === 429) { limited = true; break; }
}
console.log(`Password spray across accounts → blocked after ${tries} attempts  ${limited ? '\x1b[32mOK\x1b[0m' : '\x1b[31mUNLIMITED\x1b[0m'}`);

// A locked-out account must not block a different user on a different IP.
await reset();
for (let i = 0; i < 15; i++) await login(players[1], `wrong${i}`);
const victimStatus = await login(players[2], PW);
console.log(`Other user unaffected by neighbour's lockout → ${victimStatus}  ${victimStatus === 200 ? '\x1b[32mOK\x1b[0m' : '\x1b[31mCOLLATERAL\x1b[0m'}`);

await reset();
redis.disconnect();
