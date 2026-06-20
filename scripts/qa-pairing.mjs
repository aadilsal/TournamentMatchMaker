/** Focused pairing + buyback QA — node scripts/qa-pairing.mjs */
const API = "http://localhost:3000/api/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

async function login(email) {
  const { json } = await req("POST", "/auth/login", {
    email,
    password: "password123",
  });
  if (!json.success) throw new Error(json.error?.message);
  return json.data.accessToken;
}

async function main() {
  console.log("\n=== Pairing & Buyback QA ===\n");
  await sleep(2000);

  const p5 = await login("player5@vrtournament.com");
  const p6 = await login("player6@vrtournament.com");

  let r = await req("GET", "/matchmaking/status", null, p5);
  console.log("Player5 (VR, pre-queued) status:", JSON.stringify(r.json.data));

  const tournaments =
    (await req("GET", "/tournaments", null, p5)).json.data ?? [];
  const karachi = tournaments.find((t) => t.name === "Karachi Open VR");
  if (!karachi) {
    console.log("Karachi Open not found");
    return;
  }

  // VR player6 enters tournament (registers + joins queue)
  const t0 = Date.now();
  r = await req("POST", `/tournaments/${karachi.id}/enter`, {}, p6);
  console.log(
    `\nPlayer6 VR enter: ${Date.now() - t0}ms`,
    r.status,
    r.json.error?.message ?? "ok",
  );

  // Poll pairing
  let paired = false;
  let pairMs = 0;
  let match = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const s5 = await req("GET", "/matchmaking/status", null, p5);
    const s6 = await req("GET", "/matchmaking/status", null, p6);
    const m5 = (await req("GET", "/matches/me", null, p5)).json.data ?? [];
    const m6 = (await req("GET", "/matches/me", null, p6)).json.data ?? [];
    const active5 = m5.find((m) =>
      ["pending_confirmation", "confirmed", "in_progress"].includes(m.status),
    );
    const active6 = m6.find((m) =>
      ["pending_confirmation", "confirmed", "in_progress"].includes(m.status),
    );
    if (active5 || active6) {
      paired = true;
      pairMs = (i + 1) * 500;
      match = active5 ?? active6;
      console.log(`Pair found at ~${pairMs}ms`);
      console.log(
        "Player5 inQueue:",
        s5.json.data?.inQueue,
        "Player6 inQueue:",
        s6.json.data?.inQueue,
      );
      console.log(
        "Match:",
        match.id,
        match.status,
        match.player1?.username,
        "vs",
        match.player2?.username,
      );
      break;
    }
  }
  if (!paired) console.log("FAIL: No pair within 10s");

  // Buyback check — find eliminated player with loss in Lahore
  console.log("\n--- Buyback eligibility ---");
  const p1 = await login("player@vrtournament.com");
  const lahore = tournaments.find((t) => t.name === "Lahore VR Championship");
  const matches = (await req("GET", "/matches/me", null, p1)).json.data ?? [];
  const losses = matches.filter(
    (m) =>
      m.status === "completed" &&
      m.result?.winnerId &&
      m.result.winnerId !== matches[0]?.player1Id,
  );
  console.log("Player1 matches:", matches.length);
  const part = (
    await req("GET", `/tournaments/${lahore?.id}/participant`, null, p1)
  ).json.data;
  console.log(
    "Player1 Lahore participant:",
    part?.status,
    "losses:",
    part?.losses,
  );

  // player10 eliminated in seed
  const p10 = await login("player10@vrtournament.com");
  const part10 = (
    await req("GET", `/tournaments/${lahore?.id}/participant`, null, p10)
  ).json.data;
  const m10 = (await req("GET", "/matches/me", null, p10)).json.data ?? [];
  const lost = m10.filter(
    (m) =>
      m.status === "completed" &&
      m.result?.winnerId &&
      m.tournamentId === lahore?.id,
  );
  console.log(
    "Player10 participant:",
    part10?.status,
    "completed tournament matches:",
    lost.length,
  );
  if (part10?.status === "eliminated") {
    r = await req("POST", `/tournaments/${lahore.id}/buyback`, {}, p10);
    console.log(
      "Buyback attempt:",
      r.status,
      r.json.error?.message ?? "success",
    );
  }

  // Venue player flow
  console.log("\n--- Venue enter flow (player4) ---");
  const p4 = await login("player4@vrtournament.com");
  const islamabad = tournaments.find((t) => t.name === "Islamabad VR League");
  r = await req("POST", `/tournaments/${islamabad?.id}/enter`, {}, p4);
  console.log("Enter without slot:", r.status, r.json.error?.message);

  const venues =
    (await req("GET", "/venues?city=Islamabad", null, p4)).json.data ?? [];
  const slots = venues[0]
    ? (
        await req(
          "GET",
          `/venues/${venues[0].id}/slots?date=${new Date().toISOString().slice(0, 10)}`,
          null,
          p4,
        )
      ).json.data
    : [];
  const avail = (slots ?? []).find((s) => s.status === "available");
  if (avail && islamabad) {
    r = await req(
      "POST",
      `/tournaments/${islamabad.id}/enter`,
      { venueId: venues[0].id, timeSlotId: avail.id },
      p4,
    );
    console.log(
      "Enter with slot:",
      r.status,
      r.json.error?.message ?? "searching=" + r.json.data?.searching,
    );
  }

  console.log("\nDone.\n");
}

main().catch(console.error);
