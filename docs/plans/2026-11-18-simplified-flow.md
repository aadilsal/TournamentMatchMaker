# Simplified player flow and tournament format

**Date:** 2026-11-18 · **Status:** approved, in progress · **Branch:** `feat/simplified-flow`

## Why

Players get lost between registering and playing, VR and arena players follow two different
flows, and the tournament rules are hard to predict. Time slots sit underneath almost all of it:
every entry (even a VR player at home) borrows a venue slot, and the slot decides when a score
is accepted, when a match expires and when a bot appears.

## Decisions

| # | Decision |
|---|---|
| D1 | **No time slots anywhere for players** — tournaments and casual bookings. Slot/booking tables stay in the database, unused. No admin slot editor. |
| D2 | **Draw-based rounds** (named opponent each round) replace the live queue for new tournaments. Matchmaking must stay correct: covered by the test plan below. |
| D3 | **Join before round 1 starts only.** Registration closes automatically at the start time. |
| D4 | **No videos for now (2026-11-19).** Instead a full user manual (players and admins) with flow diagrams, written once the new flow is built. |
| D5 | **A player can be in several tournaments at once.** The one-live-tournament rule is removed. |
| D6 | **Same flow for VR and arena players.** "Home" is a place to play, shown only to players with a VR headset. |
| D7 | **Personalised headset.** Once the link code identifies a player, the headset gets their name, place to play, status, skill tier, round status and tournaments. |
| D8 | **Rules confirmed 2026-11-18:** tie → replay, first to bat wins if still tied at close; buybacks in round 1 only; bots never advance; one played → they win, neither → both out; VR toggle locked while playing from Home. |

## Player experience

```
Sign up / log in
   │
① Choose a tournament     only open tournaments; nothing else reachable until one is chosen
   │
② Where will you play?    venues nearest first, plus "Home" for VR players — one tap joins
   │
③ My tournaments          one card per tournament that always says what to do next
```

- **First-time players are locked into ① → ② → ③.** The server reports the player's step
  (`GET /players/me/journey`) and the app routes there after login, refresh and deep links.
- **After the first tournament**, ③ is home. "Join another tournament" re-runs ① → ②. Step ②
  is only reachable with a tournament chosen.
- **Navigation:** My tournaments · Profile (+ Admin for staff). Venues and Bookings leave the
  menu; venues are only chosen inside ②.
- **Card states (plain words):** waiting for the start · your opponent and the deadline ·
  "you scored 47, waiting for Ali" · won, next round opens … · knocked out, buy back? · champion.
- **The headset code** sits on the My tournaments page for every player, with
  "Enter 4821 in the Quest app".
- The VR-headset toggle is locked while the player is in a live tournament with Home chosen.

## Tournament format (new tournaments)

- **States:** Draft → Registration open → Live → Finished. "Closed" and `phase` go.
- **Round schedule:** round *n* opens at `start + (n−1) × roundLength` and closes one round
  length later. The draw for the next round happens when a round closes.
- **Draw:** every round re-seeds the field by rating (random tie-breaks) and pairs top against
  bottom, so the strongest players meet last. An odd field gives the lowest seed the tournament bot.
- **Playing:** each player plays one innings any time inside the round. The first to play sets
  the target, the second chases it (unchanged headset behaviour).
- **Settling a match:**
  - Both played → the higher score wins.
  - Tie → both replay while the round is open. Still tied at close → the player who played first wins.
  - One played → that player wins.
  - Neither played → both are out.
- **Bots never advance.** If a human loses to the bot, or doesn't play, the slot is dropped from
  the next draw.
- **Buybacks:** a knocked-out player can buy back until the round they lost in closes, and only
  in round 1. They join the round-2 draw. Rounds remaining = ⌈log₂(field)⌉, so the finish date
  is shown as "about".
- **Admin form:** name, start date/time, round length, max players, buyback price. The end date
  is calculated and shown, not entered.

Existing tournaments keep the old rules (per-tournament `format` flag) until they finish.

## Realistic bot

- The bot plays second whenever it can and reacts to the human's score. It lands within a few
  runs either side. It wins about 40% of the time (setting). It never ties. The score stays in
  the 0–36 range a 6-ball innings allows.
- If the bot must set the target, it uses the player's recent average ± variation.
- Bots receive no emails.

## Headset (Meta) API impact

- **Unchanged:** `GET /matches/current` and `POST /matches/:id/scores` (chase/target fields stay).
- **Changed:** slot fields return `null`.
- **Multiple tournaments:** `/matches/current` returns the match with the earliest deadline, adds
  a `matches[]` list, and accepts an optional `tournamentId`.
- **Solo target:** not used by new-format tournaments (`canSubmitSoloTarget: false`).
- The VR team gets a change note in `docs/integrations/meta/`.

### Personalised player card (D7)

`POST /identity/verify-link-code` adds a `player` object (additive; `userId`/`username` stay).
The same object is returned by `GET /players/profile?userId=` so the headset can refresh it
on every menu open. No email or other private data is sent.

```json
{
  "userId": "…", "username": "ali_khan", "city": "Lahore",
  "greeting": "Welcome back, Ali!",
  "skillTier": 3, "skillTierLabel": "Tier 3", "ratingPoints": 812,
  "record": { "played": 10, "wins": 7, "losses": 3 },
  "tournaments": [
    {
      "id": "…", "name": "Super Over Cup", "status": "live",
      "playingAt": { "type": "venue", "name": "Super Over Arena", "city": "Lahore" },
      "myStatus": "active",
      "statusText": "You're through to the quarter-final",
      "round": { "number": 2, "label": "Quarter-final", "state": "open", "closesAt": "…" },
      "match": { "id": "…", "opponent": "zara_vr", "state": "your_turn" }
    }
  ]
}
```

- `playingAt.type`: `venue` or `home`.
- `myStatus`: `registered`, `active`, `knocked_out`, `champion` or `finished`.
- `round.state`: `upcoming`, `open` or `closed`.
- `match.state`: `your_turn`, `waiting_for_opponent` or `decided`.

## Test plan for matchmaking (D2)

- **Unit:** draw for field sizes 2–64 (odd, even, powers of two), buybacks, byes and bots,
  bracket order, and every settle case (ties, no-shows, bot matches).
- **Worker integration:** simulate full tournaments to a champion with headset calls at 8, 9,
  31 and 32 players. Include no-shows, a buyback and a player in two tournaments at once.
- **Concurrency:** two settle/draw runs at the same moment produce exactly one draw (advisory lock).
- **Regression:** the existing api/worker/web suites and the QA scripts.

## Phases

| # | Phase | Size |
|---|---|---|
| 0 | Docs reorganised under `docs/` | S |
| 1 | Realistic bot, no bot emails | S |
| 2 | Slots removed, Home added, one flow for VR and arena, multiple tournaments | L |
| 2b | Personalised headset player card | M |
| 3 | Draw-based rounds, four states, short admin form | L |
| 4 | Guided ① → ② → ③ journey, navigation lock, plain copy | M |
| 5 | Admin clean-up: slots and bookings hidden, dashboard shows players per venue | S |
| 6 | User manual for players and admins, flow diagrams, VR-team change note | M |
