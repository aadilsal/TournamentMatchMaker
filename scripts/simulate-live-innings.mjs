#!/usr/bin/env node
// Plays a fake innings ball by ball through the headset API, for demoing the live score.
// Usage: node scripts/simulate-live-innings.mjs --match <matchId> --user <userId> [--balls "1,4,0,6,W"] [--api http://localhost:3000] [--delay 2500] [--allow-remote]
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]] : acc), [])
);
const api = String(args.api ?? 'http://localhost:3000');
const delay = Number(args.delay ?? 2500);
if (!args.match || !args.user) {
  console.error('usage: --match <matchId> --user <userId> [--api URL] [--delay ms]');
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api) && !args['allow-remote']) {
  console.error('Refusing a non-local API without --allow-remote.');
  process.exit(1);
}

const envKey = () => {
  if (process.env.META_API_KEY) return process.env.META_API_KEY;
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf-8').split(/\r?\n/).filter((l) => l.startsWith('META_API_KEY=')).pop();
  return line?.slice('META_API_KEY='.length).trim();
};
const headers = { 'content-type': 'application/json', 'x-meta-api-key': envKey() ?? '' };
const call = async (path, body) => {
  const res = await fetch(`${api}/api/v1/integrations/meta/matches/${args.match}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? ''}`);
  return json.data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Weighted like real batting: plenty of dots and singles, the odd boundary and wicket.
const outcome = () => {
  const r = Math.random();
  if (r < 0.06) return { runs: 0, wicket: true };
  if (r < 0.3) return { runs: 0 };
  if (r < 0.58) return { runs: 1 };
  if (r < 0.72) return { runs: 2 };
  if (r < 0.76) return { runs: 3 };
  if (r < 0.9) return { runs: 4 };
  return { runs: 6 };
};

// --balls "1,4,0,6,W,2" plays a fixed sequence instead of random balls.
const scripted = typeof args.balls === 'string' ? args.balls.split(',').map((x) => (x.trim().toUpperCase() === 'W' ? { runs: 0, wicket: true } : { runs: Number(x) })) : null;
const next = (seq) => (scripted ? scripted[seq - 1] : outcome());

const started = await call('/start', { userId: args.user });
const total = started.ballsPerInnings;
console.log(`Innings started: ${total} balls${started.amChasing ? `, chasing ${started.chaseTarget}` : ''}`);
let runs = 0;
let wickets = 0;
let fours = 0;
let sixes = 0;
for (let seq = 1; seq <= (scripted ? Math.min(total, scripted.length) : total); seq++) {
  await sleep(delay);
  const o = next(seq);
  runs += o.runs;
  if (o.wicket) wickets += 1;
  if (o.runs === 4) fours += 1;
  if (o.runs === 6) sixes += 1;
  const res = await call('/balls', { userId: args.user, balls: [{ seq, runs: o.runs, wicket: !!o.wicket, totalRuns: runs, wicketsLost: wickets }] });
  const need = res.needed ? `  need ${res.needed.runs} off ${res.needed.balls}` : '';
  console.log(`ball ${seq}: ${o.wicket ? 'W' : o.runs}  →  ${runs}/${wickets}${need}`);
  if (res.needed && res.needed.runs === 0) break;
}
await call("/scores", { userId: args.user, score: runs, wicketsLost: wickets, fours, sixes });
console.log(`Innings submitted: ${runs}/${wickets}`);
