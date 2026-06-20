/**
 * Brutal end-to-end QA — node scripts/qa-brutal.mjs
 */
const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const BASE = API.replace('/api/v1', '');
const PASSWORD = 'password123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const tokens = {};

function log(section, test, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'SKIP' ? '○' : '·';
  console.log(`${icon} [${section}] ${test}${detail ? ` — ${detail}` : ''}`);
  results.push({ section, test, status, detail });
}

async function req(method, path, body, token) {
  await sleep(50);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = body != null && !['GET', 'HEAD', 'DELETE'].includes(method);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { status: 0, json: { success: false, error: { message: String(err) } } };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(email, label = email) {
  const { json } = await req('POST', '/auth/login', { email, password: PASSWORD });
  if (!json.success) throw new Error(`Login failed (${label}): ${json.error?.message}`);
  tokens[label] = json.data.accessToken;
  return json.data.accessToken;
}

async function testHealth() {
  const section = 'Health';
  try {
    const res = await fetch(`${BASE}/health`);
    const json = await res.json();
    log(section, 'API health', json.data?.status === 'ok' ? 'PASS' : 'FAIL', JSON.stringify(json.data));
  } catch (e) {
    log(section, 'API health', 'FAIL', String(e));
  }
}

async function testAuth() {
  const section = 'Auth';

  let r = await req('GET', '/players/me');
  log(section, 'Unauthenticated /players/me', r.status === 401 ? 'PASS' : 'FAIL', `status ${r.status}`);

  r = await req('POST', '/auth/login', { email: 'nope@test.com', password: 'wrong' });
  log(section, 'Wrong credentials', r.status === 401 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('POST', '/auth/register', { email: 'bad', password: '1', username: 'x' });
  log(section, 'Invalid register body', r.status === 400 ? 'PASS' : 'FAIL', r.json.error?.code);

  r = await req('POST', '/auth/register', {
    email: 'player@vrtournament.com',
    password: PASSWORD,
    username: 'unique_user_x',
  });
  log(section, 'Duplicate email', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('POST', '/auth/register', {
    email: 'newunique@test.com',
    password: PASSWORD,
    username: 'player1',
  });
  log(section, 'Duplicate username', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('GET', '/auth/check-availability?email=player@vrtournament.com');
  log(section, 'Email taken check', r.json.data?.emailTaken === true ? 'PASS' : 'FAIL');

  r = await req('GET', '/auth/check-availability?username=player2_vr');
  log(section, 'Username taken check', r.json.data?.usernameTaken === true ? 'PASS' : 'FAIL');

  r = await req('GET', '/auth/check-availability?username=totally_unique_qa_name');
  log(section, 'Username free check', r.json.data?.usernameTaken === false ? 'PASS' : 'FAIL');

  await login('player@vrtournament.com', 'player1');
  log(section, 'Login player1', tokens.player1 ? 'PASS' : 'FAIL');
}

async function testGeo() {
  const section = 'Geo';
  let r = await req('GET', '/geo/countries');
  log(section, 'List countries', r.json.success && r.json.data?.length > 0 ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} countries`);

  r = await req('GET', '/geo/cities?country=Pakistan');
  log(section, 'Cities Pakistan', r.json.success && r.json.data?.length > 0 ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} cities`);

  r = await req('GET', '/geo/cities?country=InvalidCountryXYZ');
  log(section, 'Invalid country cities', r.status === 404 || r.status === 503 ? 'PASS' : 'FAIL', `status ${r.status}`);
}

async function testVenues(token) {
  const section = 'Venues';
  let r = await req('GET', '/venues?city=Lahore&limit=5', null, token);
  const venues = r.json.data ?? [];
  log(section, 'List Lahore venues', venues.length >= 1 ? 'PASS' : 'FAIL', `${venues.length} venues`);

  r = await req('GET', '/venues?lat=31.52&lng=74.35&limit=3', null, token);
  log(section, 'Geo search venues', r.json.success ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} by coords`);

  r = await req('GET', '/venues/00000000-0000-0000-0000-000000000000', null, token);
  log(section, 'Venue 404', r.status === 404 ? 'PASS' : 'FAIL');

  if (venues[0]) {
    const today = new Date().toISOString().slice(0, 10);
    r = await req('GET', `/venues/${venues[0].id}/slots?date=${today}`, null, token);
    log(section, 'Venue slots today', r.json.success ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} slots`);

    r = await req('GET', `/venues/${venues[0].id}`, null, token);
    log(section, 'Venue detail', r.json.success && r.json.data?.id === venues[0].id ? 'PASS' : 'FAIL', r.json.data?.name);
  }
}

async function testBookings(token) {
  const section = 'Bookings';
  let r = await req('GET', '/bookings/me', null, token);
  const bookings = r.json.data ?? [];
  log(section, 'List my bookings', r.json.success ? 'PASS' : 'FAIL', `${bookings.length} bookings`);

  r = await req('POST', '/bookings', { timeSlotId: '00000000-0000-0000-0000-000000000000' }, token);
  log(section, 'Book fake slot', r.status === 404 || r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('DELETE', '/bookings/00000000-0000-0000-0000-000000000000', null, token);
  log(section, 'Cancel fake booking', r.status === 404 ? 'PASS' : 'FAIL', r.json.error?.message ?? `status ${r.status}`);
}

async function testTournaments(token) {
  const section = 'Tournaments';
  let r = await req('GET', '/tournaments', null, token);
  const all = r.json.data ?? [];
  log(section, 'List tournaments', all.length >= 5 ? 'PASS' : 'FAIL', `${all.length} total`);

  const open = all.find((t) => t.status === 'open');
  const inProgress = all.find((t) => t.status === 'in_progress' && t.phase === 'normal');
  const knockout = all.find((t) => t.phase === 'knockout');

  if (open) {
    r = await req('GET', `/tournaments/${open.id}`, null, token);
    log(section, 'Open tournament detail', r.json.success ? 'PASS' : 'FAIL', open.name);

    r = await req('GET', `/tournaments/${open.id}/bracket`, null, token);
    log(section, 'Open tournament bracket', r.json.success ? 'PASS' : 'FAIL');

    r = await req('GET', `/tournaments/${open.id}/participants`, null, token);
    log(section, 'Open tournament participants', r.json.success && r.json.data?.length > 0 ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0}`);

    r = await req('GET', `/tournaments/${open.id}/rounds`, null, token);
    log(section, 'Open tournament rounds', r.json.success ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} rounds`);

    r = await req('GET', `/tournaments/${open.id}/matches`, null, token);
    log(section, 'Open tournament matches', r.json.success ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} matches`);
  }

  if (inProgress) {
    r = await req('GET', `/tournaments/${inProgress.id}/registration`, null, token);
    log(section, 'My registration (Lahore)', r.json.success ? 'PASS' : 'INFO', r.json.data ? 'registered' : 'none');

    r = await req('GET', `/tournaments/${inProgress.id}/participant`, null, token);
    log(section, 'My participant status', r.json.success ? 'PASS' : 'FAIL', r.json.data?.status ?? 'none');
  }

  if (knockout) {
    r = await req('GET', `/tournaments/${knockout.id}/bracket`, null, token);
    const hasKo = (r.json.data?.rounds ?? []).some((round) => round.phase === 'knockout');
    log(section, 'Knockout bracket', hasKo ? 'PASS' : 'FAIL', knockout.name);
  }

  r = await req('POST', `/tournaments/${all[0]?.id}/buyback`, {}, token);
  log(section, 'Buyback rejected (active player)', r.status === 409 || r.status === 403 ? 'PASS' : 'FAIL', r.json.error?.message);
}

async function testMatches(token) {
  const section = 'Matches';
  let r = await req('GET', '/matches/me', null, token);
  const matches = r.json.data ?? [];
  log(section, 'List my matches', r.json.success ? 'PASS' : 'FAIL', `${matches.length} matches`);

  const statuses = [...new Set(matches.map((m) => m.status))];
  log(section, 'Match status variety', statuses.length >= 2 ? 'PASS' : 'INFO', statuses.join(', '));

  const pending = matches.find((m) => m.status === 'pending_confirmation');
  const inProgress = matches.find((m) => m.status === 'in_progress' || m.status === 'confirmed');
  const completed = matches.find((m) => m.status === 'completed');

  if (pending) {
    r = await req('GET', `/matches/${pending.id}`, null, token);
    log(section, 'Get pending match detail', r.json.success ? 'PASS' : 'FAIL');
    log(section, 'Pending has confirmations', pending.confirmations ? 'PASS' : 'INFO', JSON.stringify(pending.confirmations));
  }

  r = await req('POST', '/matches/00000000-0000-0000-0000-000000000000/confirm', {}, token);
  log(section, 'Confirm fake match', r.status === 404 ? 'PASS' : 'FAIL');

  r = await req('POST', '/matches/00000000-0000-0000-0000-000000000000/decline', { requeue: false }, token);
  log(section, 'Decline fake match', r.status === 404 ? 'PASS' : 'FAIL');

  if (completed) {
    r = await req('POST', `/matches/${completed.id}/score`, { score: 99 }, token);
    log(section, 'Score completed match blocked', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);
  }

  if (inProgress) {
    log(section, 'In-progress match exists', 'PASS', inProgress.id.slice(0, 8));
  }
}

async function testMatchmaking() {
  const section = 'Matchmaking';
  const p5 = await login('player5@vrtournament.com', 'player5');
  // VR player with no active seed matches in Karachi Open
  const p20 = await login('player20@vrtournament.com', 'player20');

  let r = await req('GET', '/matchmaking/status', null, p5);
  log(section, 'Player5 pre-queued', r.json.data?.inQueue === true ? 'PASS' : 'FAIL', JSON.stringify(r.json.data));

  r = await req('GET', '/matchmaking/status', null, tokens.player1);
  log(section, 'Player1 not in queue', r.json.data?.inQueue === false ? 'PASS' : 'FAIL');

  const tournaments = (await req('GET', '/tournaments', null, p20)).json.data ?? [];
  const karachi = tournaments.find((t) => t.name === 'Karachi Open VR');
  if (!karachi) {
    log(section, 'Karachi Open for pairing', 'FAIL', 'tournament missing');
    return;
  }

  const t0 = Date.now();
  r = await req('POST', `/tournaments/${karachi.id}/enter`, {}, p20);
  log(section, 'VR player20 enter Karachi', r.json.success || r.status === 409 ? 'PASS' : 'FAIL', `${Date.now() - t0}ms ${r.json.error?.message ?? 'ok'}`);

  let paired = false;
  let pairMs = 0;
  let pairMatch = null;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    const s5 = await req('GET', '/matchmaking/status', null, p5);
    const s20 = await req('GET', '/matchmaking/status', null, p20);
    const m5 = (await req('GET', '/matches/me', null, p5)).json.data ?? [];
    const recent = m5.find(
      (m) =>
        m.tournamentId === karachi.id &&
        ['pending_confirmation', 'confirmed'].includes(m.status) &&
        m.createdAt &&
        new Date(m.createdAt).getTime() >= t0 - 2000
    );
    if (recent && !s5.json.data?.inQueue && !s20.json.data?.inQueue) {
      paired = true;
      pairMs = Date.now() - t0;
      pairMatch = recent;
      break;
    }
  }
  log(
    section,
    'VR pairing (player20 + player5)',
    paired ? 'PASS' : 'FAIL',
    paired
      ? `${pairMs}ms → ${pairMatch?.player1?.username} vs ${pairMatch?.player2?.username} (${pairMatch?.status})`
      : '>12s or queue not cleared'
  );

  if (pairMatch) {
    r = await req('POST', '/matchmaking/queue', { tournamentId: karachi.id }, p20);
    log(section, 'Join queue when already matched', r.status === 409 ? 'PASS' : 'FAIL', r.json.error?.message);
  }
}

async function testVenueEnterFlow() {
  const section = 'VenueEnter';
  const p4 = await login('player4@vrtournament.com', 'player4');
  const tournaments = (await req('GET', '/tournaments', null, p4)).json.data ?? [];
  const islamabad = tournaments.find((t) => t.name === 'Islamabad VR League');
  if (!islamabad) {
    log(section, 'Islamabad tournament', 'FAIL', 'missing');
    return;
  }

  let r = await req('POST', `/tournaments/${islamabad.id}/enter`, {}, p4);
  log(section, 'Enter without slot rejected', r.status === 400 ? 'PASS' : 'FAIL', r.json.error?.message);

  const venues = (await req('GET', '/venues?city=Islamabad', null, p4)).json.data ?? [];
  if (!venues[0]) {
    log(section, 'Islamabad venues', 'FAIL', 'none');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const date of [today, tomorrow]) {
    const slots = (await req('GET', `/venues/${venues[0].id}/slots?date=${date}`, null, p4)).json.data ?? [];
    const avail = slots.find((s) => s.status === 'available');
    if (avail) {
      r = await req('POST', `/tournaments/${islamabad.id}/enter`, { venueId: venues[0].id, timeSlotId: avail.id }, p4);
      log(section, 'Enter with valid slot', r.json.success ? 'PASS' : 'FAIL', r.json.error?.message ?? `searching=${r.json.data?.searching}`);

      r = await req('GET', '/matchmaking/status', null, p4);
      log(section, 'Venue player queued after enter', r.json.data?.inQueue === true ? 'PASS' : 'INFO', JSON.stringify(r.json.data));

      await req('DELETE', '/matchmaking/queue', null, p4);
      r = await req('GET', '/matchmaking/status', null, p4);
      log(section, 'Leave queue', r.json.data?.inQueue === false ? 'PASS' : 'FAIL');
      return;
    }
  }
  log(section, 'Enter with valid slot', 'SKIP', 'no available slots today or tomorrow');
}

async function testBuyback() {
  const section = 'Buyback';
  const imam = await login('player10@vrtournament.com', 'imam');

  let r = await req('GET', '/players/me/buyback-options', null, imam);
  const options = r.json.data ?? [];
  log(section, 'Buyback options for imam_lefty', options.length > 0 ? 'PASS' : 'FAIL', JSON.stringify(options));

  if (options[0]) {
    r = await req('POST', `/tournaments/${options[0].tournamentId}/buyback`, {}, imam);
    log(section, 'Execute buyback', r.json.success ? 'PASS' : 'FAIL', r.json.error?.message ?? 'completed');

    r = await req('GET', '/players/me/buyback-options', null, imam);
    log(section, 'Buyback options cleared after buy', (r.json.data ?? []).length === 0 ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} remaining`);

    r = await req('GET', `/tournaments/${options[0].tournamentId}/participant`, null, imam);
    log(section, 'Status active after buyback', r.json.data?.status === 'active' ? 'PASS' : 'FAIL', r.json.data?.status);

    r = await req('GET', '/matchmaking/status', null, imam);
    const hasActive = (await req('GET', '/matches/me', null, imam)).json.data?.some((m) =>
      ['pending_confirmation', 'confirmed', 'in_progress'].includes(m.status)
    );
    log(
      section,
      'Re-queued after buyback',
      r.json.data?.inQueue === true ? 'PASS' : hasActive ? 'INFO' : 'FAIL',
      hasActive ? 'active match blocks requeue' : JSON.stringify(r.json.data)
    );
  }
}

async function testProfileAndNotifications() {
  const section = 'Profile';
  const token = tokens.player1;
  let r = await req('GET', '/players/me', null, token);
  log(section, 'Get profile', r.json.success && r.json.data?.username === 'player1' ? 'PASS' : 'FAIL');

  r = await req('PATCH', '/players/me', { username: 'ab' }, token);
  log(section, 'Invalid username patch', r.status === 400 ? 'PASS' : 'FAIL', r.json.error?.message);

  r = await req('GET', '/players/player2_vr', null, token);
  log(section, 'Public profile', r.json.success ? 'PASS' : 'FAIL', r.json.data?.username);

  r = await req('GET', '/players/nonexistent_user_xyz', null, token);
  log(section, 'Public profile 404', r.status === 404 ? 'PASS' : 'FAIL');

  const sectionN = 'Notifications';
  r = await req('GET', '/notifications?limit=5', null, token);
  log(sectionN, 'List notifications', r.json.success ? 'PASS' : 'FAIL', `${r.json.data?.length ?? 0} items`);

  if (r.json.data?.[0]) {
    const nid = r.json.data[0].id;
    r = await req('PATCH', `/notifications/${nid}/read`, {}, token);
    log(sectionN, 'Mark notification read', r.json.success ? 'PASS' : 'FAIL');
  }

  r = await req('PATCH', '/notifications/00000000-0000-0000-0000-000000000000/read', {}, token);
  log(sectionN, 'Read fake notification', r.status === 404 ? 'PASS' : 'FAIL');
}

async function testRegistrationFlow() {
  const section = 'Register';
  const suffix = Date.now();
  let r = await req('POST', '/auth/register', {
    email: `qa_${suffix}@test.com`,
    password: PASSWORD,
    username: `qa_user_${suffix}`,
    country: 'Pakistan',
    city: 'Lahore',
    hasVrHeadset: true,
    vrDeviceType: 'Meta Quest 3',
  });
  log(section, 'Register new VR user', r.status === 201 ? 'PASS' : 'FAIL', r.json.error?.message ?? r.json.data?.user?.username);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   VR CRICKET LEAGUE — BRUTAL QA SUITE    ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`API: ${API}\n`);

  try {
    await testHealth();
    await testAuth();
    await testGeo();
    await testVenues(tokens.player1);
    await testBookings(tokens.player1);
    await testTournaments(tokens.player1);
    await testMatches(tokens.player1);
    await testProfileAndNotifications();
    await testMatchmaking();
    await testVenueEnterFlow();
    await testBuyback();
    await testRegistrationFlow();
  } catch (err) {
    console.error('\n⚠ QA aborted:', err.message);
    log('Fatal', 'Unhandled error', 'FAIL', err.message);
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const info = results.filter((r) => r.status === 'INFO').length;

  console.log('\n══════════════════════════════════════════');
  console.log(`  PASSED: ${passed}  FAILED: ${failed}  SKIP: ${skipped}  INFO: ${info}`);
  console.log('══════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  • [${r.section}] ${r.test}: ${r.detail}`));
    console.log('');
    process.exitCode = 1;
  }
}

main();
