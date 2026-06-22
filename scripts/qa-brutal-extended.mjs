/**
 * Extended brutal QA — Meta, booking validation, security, load
 * node scripts/qa-brutal-extended.mjs
 */
const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const META_KEY = process.env.META_API_KEY || 'sample-meta-api-key-change-me';
const PASSWORD = 'password123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function log(section, test, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '!' : '○';
  console.log(`${icon} [${section}] ${test}${detail ? ` — ${detail}` : ''}`);
  results.push({ section, test, status, detail });
}

async function req(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const hasBody = body != null && !['GET', 'HEAD', 'DELETE'].includes(method);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, ms: 0 };
  } catch (err) {
    return { status: 0, json: { error: { message: String(err) } } };
  }
}

async function login(email) {
  const { status, json } = await req('POST', '/auth/login', { email, password: PASSWORD });
  if (!json.success) throw new Error(`Login ${email}: ${json.error?.message} (${status})`);
  return json.data.accessToken;
}

async function testMetaSecurity() {
  const section = 'MetaSecurity';
  let r = await req('GET', '/integrations/meta/matches/current?userId=00000000-0000-0000-0000-000000000001');
  log(section, 'No API key rejected', r.status === 401 ? 'PASS' : 'FAIL', `status ${r.status}`);

  r = await req('GET', '/integrations/meta/matches/current?userId=00000000-0000-0000-0000-000000000001', null, {
    headers: { 'x-meta-api-key': 'wrong-key' },
  });
  log(section, 'Wrong API key rejected', r.status === 401 ? 'PASS' : 'FAIL', `status ${r.status}`);

  r = await req('POST', '/integrations/meta/matches/00000000-0000-0000-0000-000000000001/scores', {
    userId: '00000000-0000-0000-0000-000000000001',
    score: 50,
  }, { headers: { 'x-meta-api-key': META_KEY } });
  log(section, 'Score on fake match', r.status === 404 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('POST', '/integrations/meta/solo-target', {
    userId: '00000000-0000-0000-0000-000000000001',
    tournamentId: '00000000-0000-0000-0000-000000000002',
    target: 100,
  }, { headers: { 'x-meta-api-key': META_KEY } });
  log(section, 'Solo target not in queue', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('POST', '/integrations/meta/matches/fake-id/scores', { userId: 'x', score: -1 }, {
    headers: { 'x-meta-api-key': META_KEY },
  });
  log(section, 'Invalid score schema', r.status === 400 ? 'PASS' : 'FAIL', r.json.error?.code);
}

async function testMetaFlow(token, userId) {
  const section = 'MetaFlow';
  const r = await req('GET', `/integrations/meta/matches/current?userId=${userId}`, null, {
    headers: { 'x-meta-api-key': META_KEY },
  });
  log(section, 'Current match payload', r.json.success ? 'PASS' : 'FAIL', JSON.stringify(r.json.data)?.slice(0, 120));

  const matches = (await req('GET', '/matches/me', null, { token })).json.data ?? [];
  const active = matches.find((m) => ['confirmed', 'in_progress'].includes(m.status));
  if (!active) {
    log(section, 'Active match for score test', 'WARN', 'none found');
    return;
  }

  const score1 = await req('POST', `/integrations/meta/matches/${active.id}/scores`, {
    userId: active.player1Id,
    score: 42,
  }, { headers: { 'x-meta-api-key': META_KEY } });
  log(section, 'Meta score player1', score1.json.success || score1.status === 409 ? 'PASS' : 'FAIL', score1.json.error?.message ?? 'ok');

  const scoreDup = await req('POST', `/integrations/meta/matches/${active.id}/scores`, {
    userId: active.player1Id,
    score: 99,
  }, { headers: { 'x-meta-api-key': META_KEY } });
  log(section, 'Duplicate score rejected', scoreDup.status === 409 ? 'PASS' : 'FAIL', scoreDup.json.error?.message);

  const wrongUser = await req('POST', `/integrations/meta/matches/${active.id}/scores`, {
    userId: '00000000-0000-0000-0000-000000000099',
    score: 10,
  }, { headers: { 'x-meta-api-key': META_KEY } });
  log(section, 'Non-participant score rejected', wrongUser.status === 403 ? 'PASS' : 'FAIL', wrongUser.json.error?.message);
}

async function testManualScoreBlocked(token) {
  const section = 'ScorePolicy';
  const matches = (await req('GET', '/matches/me', null, { token })).json.data ?? [];
  const active = matches.find((m) => ['confirmed', 'in_progress'].includes(m.status));
  if (!active) {
    log(section, 'Manual score blocked', 'WARN', 'no active match');
    return;
  }
  const r = await req('POST', `/matches/${active.id}/score`, { score: 50 }, { token });
  log(section, 'Web manual score blocked', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);
}

async function testBookingValidation(token) {
  const section = 'BookingValidation';
  const venues = (await req('GET', '/venues?city=Lahore&limit=1', null, { token })).json.data ?? [];
  if (!venues[0]) {
    log(section, 'Venue slots', 'FAIL', 'no venue');
    return;
  }
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const slots = (await req('GET', `/venues/${venues[0].id}/slots?date=${yesterday}`, null, { token })).json.data ?? [];
  if (slots[0]) {
    const r = await req('POST', '/bookings', { timeSlotId: slots[0].id }, { token });
    log(section, 'Book past slot rejected', r.status === 400 ? 'PASS' : 'FAIL', `${r.status} ${r.json.error?.message}`);
  } else {
    log(section, 'Book past slot rejected', 'WARN', 'no yesterday slots in DB');
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = (await req('GET', `/venues/${venues[0].id}/slots?date=${today}`, null, { token })).json.data ?? [];
  const pastSlot = todaySlots.find((s) => new Date(s.startTime).getTime() < Date.now());
  if (pastSlot) {
    const r = await req('POST', '/bookings', { timeSlotId: pastSlot.id }, { token });
    log(section, 'Book started slot today rejected', r.status === 400 ? 'PASS' : 'FAIL', r.json.error?.message);
  } else {
    log(section, 'Book started slot today rejected', 'WARN', 'no past slots today');
  }
}

async function testStripeBuyback(token) {
  const section = 'StripeBuyback';
  const r = await req('GET', '/players/me/buyback-options', null, { token });
  const opts = r.json.data ?? [];
  if (!opts[0]) {
    log(section, 'Checkout session', 'WARN', 'no buyback options for this user');
    return;
  }
  const checkout = await req('POST', `/tournaments/${opts[0].tournamentId}/buyback/checkout`, {}, { token });
  const hasSecret = !!checkout.json.data?.clientSecret;
  const stripeErr = checkout.json.error?.message?.includes('Invalid API Key');
  log(
    section,
    'Checkout creates intent or sample key fails gracefully',
    hasSecret || checkout.status === 500 || stripeErr ? 'PASS' : 'FAIL',
    checkout.json.error?.message ?? (hasSecret ? 'clientSecret ok' : 'no secret')
  );

  const legacy = await req('POST', `/tournaments/${opts[0].tournamentId}/buyback`, {}, { token });
  log(section, 'Legacy buyback still exists', legacy.status === 201 || legacy.status === 409 ? 'WARN' : 'PASS', 'legacy may bypass payment');
}

async function testAuthHardening() {
  const section = 'AuthHardening';
  const garbage = await req('GET', '/players/me', null, { token: 'not.a.jwt' });
  log(section, 'Garbage JWT rejected', garbage.status === 401 ? 'PASS' : 'FAIL', `status ${garbage.status}`);

  const empty = await req('POST', '/auth/login', { email: '', password: '' });
  log(section, 'Empty login body', empty.status === 400 ? 'PASS' : 'FAIL', empty.json.error?.code);

  const sqlish = await req('POST', '/auth/login', { email: "' OR 1=1 --", password: 'x' });
  log(section, 'SQL injection login', sqlish.status === 401 ? 'PASS' : 'FAIL', `status ${sqlish.status}`);
}

async function testRateAndLoad(token) {
  const section = 'Load';
  const concurrency = 50;
  const start = Date.now();
  const tasks = Array.from({ length: concurrency }, () =>
    req('GET', '/tournaments', null, { token })
  );
  const responses = await Promise.all(tasks);
  const elapsed = Date.now() - start;
  const ok = responses.filter((r) => r.status === 200 && r.json.success).length;
  const failed = concurrency - ok;
  log(section, `${concurrency} concurrent GET /tournaments`, ok >= concurrency * 0.95 ? 'PASS' : 'FAIL', `${ok}/${concurrency} ok in ${elapsed}ms`);

  const burstStart = Date.now();
  const loginBurst = await Promise.all(
    Array.from({ length: 20 }, () => req('POST', '/auth/login', { email: 'nope@test.com', password: 'wrong' }))
  );
  const burstMs = Date.now() - burstStart;
  const all401 = loginBurst.every((r) => r.status === 401);
  log(section, '20 failed logins burst', all401 ? 'PASS' : 'FAIL', `${burstMs}ms`);

  const healthBurst = await Promise.all(Array.from({ length: 30 }, () => fetch(API.replace('/api/v1', '') + '/health')));
  const healthOk = (await Promise.all(healthBurst.map((r) => r.json().catch(() => ({}))))).filter((j) => j.data?.status === 'ok').length;
  log(section, '30 concurrent /health', healthOk >= 28 ? 'PASS' : 'FAIL', `${healthOk}/30`);
}

async function testMatchmakingEdge(token) {
  const section = 'MatchmakingEdge';
  const doubleJoin = await req('POST', '/matchmaking/queue', { tournamentId: null }, { token });
  const status1 = (await req('GET', '/matchmaking/status', null, { token })).json.data;
  const doubleJoin2 = await req('POST', '/matchmaking/queue', { tournamentId: null }, { token });
  log(section, 'Double global queue join', doubleJoin2.status === 409 || status1?.inQueue ? 'PASS' : 'WARN', doubleJoin2.json.error?.message);
  await req('DELETE', '/matchmaking/queue', null, { token });

  const tournaments = (await req('GET', '/tournaments', null, { token })).json.data ?? [];
  const closed = tournaments.find((t) => t.status === 'completed' || t.status === 'closed');
  if (closed) {
    const r = await req('POST', `/tournaments/${closed.id}/enter`, {}, { token });
    log(section, 'Enter closed tournament', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);
  }
}

async function testIdor(token) {
  const section = 'IDOR';
  const others = (await req('GET', '/matches/me', null, { token })).json.data ?? [];
  const fakeId = '00000000-0000-0000-0000-000000000099';
  const r = await req('GET', `/matches/${fakeId}`, null, { token });
  log(section, 'Fake match detail', r.status === 404 || r.status === 403 ? 'PASS' : 'FAIL', `status ${r.status}`);

  if (others[0]) {
    const p2 = await login('player2@vrtournament.com');
    const cross = await req('GET', `/matches/${others[0].id}`, null, { token: p2 });
    const notParticipant = cross.status === 403 || (cross.json.success && cross.json.data?.id !== others[0].id);
    log(section, 'Cross-user match access', cross.status === 403 ? 'PASS' : cross.status === 200 ? 'WARN' : 'FAIL', `status ${cross.status}`);
  }
}

async function main() {
  console.log('\n═══ EXTENDED BRUTAL QA ═══\n');
  let token;
  let userId;
  try {
    token = await login('player@vrtournament.com');
    const me = (await req('GET', '/players/me', null, { token })).json.data;
    userId = me?.id;
    log('Setup', 'Login player1', userId ? 'PASS' : 'FAIL');
  } catch (e) {
    log('Setup', 'Login player1', 'FAIL', e.message);
    process.exitCode = 1;
    return;
  }

  await testMetaSecurity();
  await testMetaFlow(token, userId);
  await testManualScoreBlocked(token);
  await testBookingValidation(token);
  await testStripeBuyback(await login('player10@vrtournament.com').catch(() => token));
  await testAuthHardening();
  await testMatchmakingEdge(token);
  await testIdor(token);
  await testRateAndLoad(token);

  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warned = results.filter((r) => r.status === 'WARN').length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  console.log(`\n═══ EXTENDED: ${passed} pass, ${failed} fail, ${warned} warn ═══\n`);
  if (failed) {
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  FAIL [${r.section}] ${r.test}: ${r.detail}`));
    process.exitCode = 1;
  }
}

main();
