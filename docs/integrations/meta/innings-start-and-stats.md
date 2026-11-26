# Innings start, heartbeat and batting stats: headset changes (API v2.7)

**For:** the VR (Meta Quest) development team
**Date:** 26 November 2026
**Status:** additive. Current headset builds keep working unchanged. The new behaviour turns on when the headset uses it.

---

## 1. Why this changes

Three problems with how a match is played today:

1. **Opening the match screen claims the turn.** `GET /matches/current` gives the turn to whoever asks first, even a player who only opened the menu. Their opponent is then blocked for up to 10 minutes.
2. **A long innings can lose its turn.** The turn expires on a fixed timer, so a slow but real innings could be refused at the end.
3. **Retries.** A player can quit a bad innings, restart, and submit only their best attempt.

The fix is to tell the server when an innings **starts**, keep it alive with a **heartbeat**, and count an **abandoned innings as 0**.

We also want each innings' **4s, 6s and wickets lost** for player and tournament statistics.

---

## 2. The new flow

```
GET  /matches/current?userId=…&explicitStart=true    (poll as now; never claims the turn)
        │  player presses PLAY
        ▼
POST /matches/{matchId}/start        { "userId": "…" }
        │  every 30 seconds while batting
        ▼
POST /matches/{matchId}/heartbeat    { "userId": "…" }
        │  innings finished
        ▼
POST /matches/{matchId}/scores       { "userId", "score", "ballsFaced", "fours", "sixes", "wicketsLost" }
```

**Rules:**
- **One attempt per player per match.** After `/start`, that innings must be finished. Calling `/start` again for the same match returns `409 INNINGS_ALREADY_STARTED`.
- **Abandoned = 0.** If no heartbeat arrives for **3 minutes**, the innings is recorded as **0 runs**, and the opponent can carry on (they chase 1, or they win if they batted first).
- **Batting first:** `/start` claims the turn. The opponent sees `waitingForOpponent: true` until the score arrives or the innings is abandoned.
- **Chasing:** `/start` works as soon as the opponent's score is in. The response includes the target.
- A **tie** is replayed as a fresh match, and both players get a new attempt.
- An innings still running when the round closes is recorded as 0.

All requests use the usual headers (`x-meta-api-key` / `x-meta-ssh-public-key`) and response envelope.

---

## 3. `GET /matches/current`: add `explicitStart=true`

```
GET /matches/current?userId=<uuid>&explicitStart=true
```

With `explicitStart=true`, polling **never claims the turn**. Send it on **every** poll from the new build.

New fields on `match`:

| Field | Type | Meaning |
|-------|------|---------|
| `myInningsStartedAt` | ISO-8601 or `null` | This player's innings has started (`/start` was called) and has no score yet. Use it to resume the batting screen after a crash. |
| `opponentBattingSince` | ISO-8601 or `null` | The opponent pressed Play and is batting first right now. |
| `turnFreesAt` | ISO-8601 or `null` | If the opponent stops sending heartbeats, their innings is abandoned at this time. Show "waiting for ali — up to 2:40". |

How to read the state:

| `match` flags | Show |
|---|---|
| `amSettingTarget: true` | **Play** button: "Bat first — set the target" |
| `amChasing: true` | **Play** button: "Chase `chaseTarget` to win" |
| `waitingForOpponent: true` and `opponentBattingSince` set | "ali is batting…", with a countdown to `turnFreesAt` |
| `waitingForOpponent: true` and `myScore >= 0` | "You scored 41 — waiting for ali" |

Example (the opponent is batting first):

```json
{
  "success": true,
  "data": {
    "inQueue": false,
    "tournamentId": "0c160535-eddf-45ab-a1f9-0040316b4f63",
    "canSubmitSoloTarget": false,
    "soloTargetState": "waiting_for_opponent",
    "match": {
      "id": "8f0f8a2e-2a7e-4c55-9d0f-6d1c2b7f4a11",
      "status": "confirmed",
      "tournamentName": "Lahore VR Championship",
      "roundLabel": "Quarter-final",
      "overs": 5,
      "ballsPerInnings": 30,
      "opponent": "ali_khan",
      "venueId": null,
      "venue": null,
      "timeSlotId": null,
      "startTime": "2026-11-26T12:00:00.000Z",
      "endTime": "2026-11-26T18:00:00.000Z",
      "chaseTarget": -1,
      "amChasing": false,
      "amSettingTarget": false,
      "myScore": -1,
      "opponentScore": -1,
      "waitingForOpponent": true,
      "myInningsStartedAt": null,
      "opponentBattingSince": "2026-11-26T13:02:10.000Z",
      "turnFreesAt": "2026-11-26T13:05:40.000Z"
    },
    "lastResult": null,
    "matches": [ … ]
  },
  "error": null,
  "meta": {}
}
```

---

## 4. `POST /matches/{matchId}/start`

Call it when the player presses **Play**, just before the first ball.

**Request**
```json
{ "userId": "3f6c1e2a-…" }
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "matchId": "8f0f8a2e-2a7e-4c55-9d0f-6d1c2b7f4a11",
    "startedAt": "2026-11-26T13:02:10.000Z",
    "amChasing": false,
    "chaseTarget": -1,
    "overs": 5,
    "ballsPerInnings": 30,
    "heartbeatIntervalSeconds": 30,
    "abandonAfterSeconds": 180
  },
  "error": null,
  "meta": {}
}
```

When chasing: `"amChasing": true, "chaseTarget": 42`.

**Errors** (`error.code`; show `error.message` to the player):

| HTTP | Code | Meaning |
|------|------|---------|
| 409 | `CONFLICT` | The opponent is batting right now, the player already played this match, the round has closed, or the match is not playable. |
| 409 | `INNINGS_ALREADY_STARTED` | This player already started this innings. Don't start a new one; finish it, or it counts as 0. |
| 403 | `FORBIDDEN` | The user is not in this match. |
| 404 | `NOT_FOUND` | Unknown match. |

---

## 5. `POST /matches/{matchId}/heartbeat`

Send it **every 30 seconds** from `/start` until the score is submitted, including during loading and pauses.

**Request**
```json
{ "userId": "3f6c1e2a-…" }
```

**Response `200`**
```json
{ "success": true, "data": { "ok": true, "abandonsAt": "2026-11-26T13:06:10.000Z" }, "error": null, "meta": {} }
```

**Errors:**

| HTTP | Code | Meaning |
|------|------|---------|
| 409 | `INNINGS_ABANDONED` | No heartbeat for 3 minutes; the innings was recorded as **0**. Stop the innings and show the result. |
| 409 | `INNINGS_NOT_STARTED` | `/start` was never called for this match. |
| 409 | `CONFLICT` | The score is already recorded. |

If a heartbeat fails because of the network, keep trying every 30 seconds. Only 3 minutes **without any successful heartbeat** abandons the innings.

---

## 6. `POST /matches/{matchId}/scores`: batting stats

New **optional** fields, sent with the score:

```json
{
  "userId": "3f6c1e2a-…",
  "score": 41,
  "ballsFaced": 30,
  "fours": 3,
  "sixes": 2,
  "wicketsLost": 1
}
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `score` | integer 0–999 | Yes | Runs scored (unchanged) |
| `ballsFaced` | integer 0–120 | No | Legal balls faced |
| `fours` | integer 0–120 | No | Boundaries worth 4 |
| `sixes` | integer 0–120 | No | Boundaries worth 6 |
| `wicketsLost` | integer 0–120 | No | Wickets that fell in this innings. They don't end the innings and carry no penalty; they're counted only for statistics. |

- **The score is never rejected because of the stats.** If `fours × 4 + sixes × 6` is more than `score`, the 4s and 6s are ignored and the score still counts.
- Please send all three on every innings. Player profiles, tournament totals and the leaderboards (most 6s, most 4s, fewest wickets lost) are built from them.

While the opponent is batting first, a score from this player is refused with `409 CONFLICT`, as now.

---

## 7. Old builds and mixed builds

- A build that doesn't send `explicitStart` and never calls `/start` behaves exactly as before.
- **Please ship the new flow to all headsets in one update.** If an old build and a new build meet in the same match, the old build still claims the turn by polling, and the new build waits for it.

---

## 8. Checklist for the VR build

- [ ] Add `explicitStart=true` to every `GET /matches/current`.
- [ ] Call `POST /matches/{id}/start` when the player presses **Play**. Handle `409` by showing `error.message`.
- [ ] Send `POST /matches/{id}/heartbeat` every 30 seconds until the score is submitted.
- [ ] On `INNINGS_ABANDONED`, stop and show that the innings counted as 0.
- [ ] Send `fours`, `sixes`, `wicketsLost` (and `ballsFaced`) with every score.
- [ ] While waiting, show "opponent is batting" with a countdown to `turnFreesAt`.
- [ ] After a crash, if `myInningsStartedAt` is set, the innings is still running: resume it or submit it before `abandonsAt`. Don't start a new one.
