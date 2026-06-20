/**
 * End-to-end API QA script — run with: node scripts/qa-api.mjs
 */
const API = process.env.API_URL || "http://localhost:3000/api/v1";
const PASSWORD = "password123";

const results = [];

function log(section, test, status, detail = "") {
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  const line = `${icon} [${section}] ${test}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  results.push({ section, test, status, detail });
}

async function req(method, path, body, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(email) {
  const { status, json } = await req("POST", "/auth/login", {
    email,
    password: PASSWORD,
  });
  if (!json.success)
    throw new Error(`Login failed for ${email}: ${json.error?.message}`);
  return json.data.accessToken;
}

async function testAuth() {
  const section = "Auth";

  let r = await req("POST", "/auth/login", {
    email: "bad@x.com",
    password: "wrong",
  });
  log(
    section,
    "Login wrong password",
    r.status === 401 ? "PASS" : "FAIL",
    `status ${r.status}`,
  );

  r = await req("POST", "/auth/register", {
    email: "not-an-email",
    password: "short",
    username: "x",
  });
  log(
    section,
    "Register invalid data",
    r.status === 400 ? "PASS" : "FAIL",
    r.json.error?.message,
  );

  r = await req("POST", "/auth/register", {
    email: "player@vrtournament.com",
    password: PASSWORD,
    username: "player_dup",
  });
  log(
    section,
    "Register duplicate email",
    r.status === 409 ? "PASS" : "FAIL",
    r.json.error?.message,
  );

  r = await req(
    "GET",
    "/auth/check-availability?email=player@vrtournament.com",
  );
  log(
    section,
    "Check email taken",
    r.json.data?.emailTaken === true ? "PASS" : "FAIL",
    JSON.stringify(r.json.data),
  );

  r = await req("GET", "/auth/check-availability?username=player2");
  log(
    section,
    "Check username taken",
    r.json.data?.usernameTaken === true ? "PASS" : "FAIL",
    JSON.stringify(r.json.data),
  );

  try {
    await login("player@vrtournament.com");
    log(section, "Login player1", "PASS");
  } catch (e) {
    log(section, "Login player1", "FAIL", String(e));
  }
}

async function testVenues(token) {
  const section = "Venues";
  let r = await req("GET", "/venues?city=Lahore&limit=3", null, token);
  log(
    section,
    "List venues Lahore",
    r.json.success && r.json.data?.length > 0 ? "PASS" : "FAIL",
    `${r.json.data?.length ?? 0} venues`,
  );

  r = await req(
    "GET",
    "/venues/00000000-0000-0000-0000-000000000000",
    null,
    token,
  );
  log(
    section,
    "Venue not found",
    r.status === 404 ? "PASS" : "FAIL",
    r.json.error?.message,
  );

  if (r.json.data?.[0]?.id) {
    const venueId = r.json.data[0].id;
    r = await req(
      "GET",
      `/venues/${venueId}/slots?date=2099-01-01`,
      null,
      token,
    );
    log(
      section,
      "Venue slots future date",
      r.json.success ? "PASS" : "FAIL",
      `${r.json.data?.length ?? 0} slots`,
    );
  }
}

async function testTournaments(token) {
  const section = "Tournaments";
  let r = await req("GET", "/tournaments", null, token);
  const tournaments = r.json.data ?? [];
  log(
    section,
    "List tournaments",
    tournaments.length >= 5 ? "PASS" : "FAIL",
    `${tournaments.length} found`,
  );

  const open = tournaments.find((t) => t.status === "open");
  const inProgress = tournaments.find((t) => t.status === "in_progress");

  if (open) {
    r = await req("GET", `/tournaments/${open.id}`, null, token);
    log(
      section,
      "Get open tournament",
      r.json.success ? "PASS" : "FAIL",
      open.name,
    );

    r = await req("GET", `/tournaments/${open.id}/bracket`, null, token);
    log(section, "Tournament bracket", r.json.success ? "PASS" : "FAIL");
  }

  if (inProgress) {
    r = await req(
      "GET",
      `/tournaments/${inProgress.id}/participant`,
      null,
      token,
    );
    log(
      section,
      "Participant on in-progress (player1)",
      r.json.success ? "PASS" : "INFO",
      r.json.data?.status ?? "none",
    );
  }

  r = await req(
    "POST",
    `/tournaments/${tournaments[0]?.id}/buyback`,
    {},
    token,
  );
  log(
    section,
    "Buyback when not eliminated",
    r.status === 409 || r.status === 403 ? "PASS" : "FAIL",
    r.json.error?.message,
  );
}

async function testMatches(token) {
  const section = "Matches";
  let r = await req("GET", "/matches/me", null, token);
  const matches = r.json.data ?? [];
  log(
    section,
    "List my matches",
    r.json.success ? "PASS" : "FAIL",
    `${matches.length} matches`,
  );

  const pending = matches.find((m) => m.status === "pending_confirmation");
  const completed = matches.find(
    (m) => m.status === "completed" && m.result?.winnerId,
  );

  if (pending) {
    r = await req("POST", `/matches/${pending.id}/confirm`, {}, token);
    log(
      section,
      "Confirm pending match",
      r.json.success || r.status === 409 ? "PASS" : "FAIL",
      r.json.error?.message ?? pending.status,
    );
  }

  r = await req(
    "POST",
    "/matches/00000000-0000-0000-0000-000000000000/confirm",
    {},
    token,
  );
  log(
    section,
    "Confirm nonexistent match",
    r.status === 404 ? "PASS" : "FAIL",
    r.json.error?.message,
  );

  if (completed) {
    r = await req(
      "POST",
      `/matches/${completed.id}/score`,
      { score: 50 },
      token,
    );
    log(
      section,
      "Score already completed match",
      r.status === 409 ? "PASS" : "FAIL",
      r.json.error?.message,
    );
  }
}

async function testMatchmaking(vrToken, venueToken) {
  const section = "Matchmaking";

  let r = await req("GET", "/matchmaking/status", null, vrToken);
  log(
    section,
    "VR player5 queue status",
    r.json.success ? "PASS" : "FAIL",
    JSON.stringify(r.json.data),
  );

  r = await req("GET", "/matchmaking/status", null, venueToken);
  log(
    section,
    "Venue player1 not in queue",
    r.json.success ? "PASS" : "FAIL",
    `inQueue=${r.json.data?.inQueue}`,
  );

  // Pairing timing test: player4 joins queue with player5
  const player4Token = await login("player4@vrtournament.com");
  const tournaments =
    (await req("GET", "/tournaments", null, player4Token)).json.data ?? [];
  const open = tournaments.find(
    (t) => t.name.includes("Karachi") || t.status === "open",
  );
  if (open) {
    const t0 = Date.now();
    r = await req(
      "POST",
      `/tournaments/${open.id}/enter`,
      { hasVrHeadset: true, vrDeviceType: "Meta Quest 3" },
      player4Token,
    );
    const enterMs = Date.now() - t0;
    log(
      section,
      "VR player4 enter tournament",
      r.json.success || r.status === 409 ? "PASS" : "FAIL",
      `${enterMs}ms — ${r.json.error?.message ?? "ok"}`,
    );

    if (r.json.success || r.status === 409) {
      r = await req(
        "POST",
        "/matchmaking/join",
        { tournamentId: open.id },
        player4Token,
      );
      log(
        section,
        "VR player4 join queue",
        r.json.success || r.status === 409 ? "PASS" : "FAIL",
        r.json.error?.message ?? "joined",
      );

      // Poll for match up to 8 seconds
      let paired = false;
      let pairMs = 0;
      for (let i = 0; i < 16; i++) {
        await new Promise((res) => setTimeout(res, 500));
        const statusR = await req(
          "GET",
          "/matchmaking/status",
          null,
          player4Token,
        );
        const matchesR = await req("GET", "/matches/me", null, player4Token);
        const active = (matchesR.json.data ?? []).find((m) =>
          ["pending_confirmation", "confirmed", "in_progress"].includes(
            m.status,
          ),
        );
        if (!statusR.json.data?.inQueue && active) {
          paired = true;
          pairMs = (i + 1) * 500;
          break;
        }
      }
      log(
        section,
        "VR pairing time (player4 + player5)",
        paired ? "PASS" : "FAIL",
        paired ? `~${pairMs}ms` : ">8s timeout",
      );
    }
  }
}

async function testBookings(token) {
  const section = "Bookings";
  let r = await req("GET", "/bookings/me", null, token);
  log(
    section,
    "List bookings",
    r.json.success ? "PASS" : "FAIL",
    `${r.json.data?.length ?? 0} bookings`,
  );

  r = await req(
    "POST",
    "/bookings",
    { timeSlotId: "00000000-0000-0000-0000-000000000000" },
    token,
  );
  log(
    section,
    "Book invalid slot",
    r.status === 404 || r.status === 409 ? "PASS" : "FAIL",
    r.json.error?.message,
  );
}

async function testProfile(token) {
  const section = "Profile";
  let r = await req("GET", "/players/me", null, token);
  log(
    section,
    "Get profile",
    r.json.success ? "PASS" : "FAIL",
    r.json.data?.username,
  );

  r = await req("PATCH", "/players/me", { username: "ab" }, token);
  log(
    section,
    "Update invalid username",
    r.status === 400 ? "PASS" : "FAIL",
    r.json.error?.message,
  );
}

async function testBuybackFlow() {
  const section = "Buyback";
  // player with eliminated status in Lahore Cup - check seed for who
  const token = await login("player3@vrtournament.com");
  const tournaments =
    (await req("GET", "/tournaments", null, token)).json.data ?? [];
  const lahore = tournaments.find(
    (t) => t.name.includes("Lahore") && t.phase === "normal",
  );
  if (lahore) {
    const partR = await req(
      "GET",
      `/tournaments/${lahore.id}/participant`,
      null,
      token,
    );
    log(
      section,
      "Player3 participant status",
      "INFO",
      partR.json.data?.status ?? "none",
    );

    if (partR.json.data?.status === "eliminated") {
      const r = await req(
        "POST",
        `/tournaments/${lahore.id}/buyback`,
        {},
        token,
      );
      log(
        section,
        "Buyback for eliminated player",
        r.json.success || r.status === 409 ? "PASS" : "FAIL",
        r.json.error?.message ?? "completed",
      );
    }
  }
}

async function main() {
  console.log("\n=== VR Cricket League API QA ===\n");
  console.log(`API: ${API}\n`);

  try {
    await testAuth();
    const player1 = await login("player@vrtournament.com");
    const player2 = await login("player2@vrtournament.com");
    const player5 = await login("player5@vrtournament.com");

    await testVenues(player1);
    await testTournaments(player1);
    await testMatches(player1);
    await testBookings(player1);
    await testProfile(player1);
    await testMatchmaking(player5, player1);
    await testBuybackFlow();
  } catch (err) {
    console.error("\nQA aborted:", err);
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const info = results.filter((r) => r.status === "INFO").length;
  console.log(
    `\n=== Summary: ${passed} passed, ${failed} failed, ${info} info ===\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main();
