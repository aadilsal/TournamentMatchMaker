# Pixel Paddle / VR Cricket League — Meta Quest Integration API

**Version:** 1.0  
**Last updated:** June 2026  
**Audience:** Meta Quest / VR game integration team  
**Contact:** aadilsalman786@gmail.com

---

## 1. Overview

Pixel Paddle is a tournament matchmaking platform. Players register on the web, join tournaments, book venue slots, and get paired for VR cricket matches. **Scores and solo targets must be submitted from the Meta Quest headset** — the web app does not accept manual scores.

This document describes the **server-to-server HTTP API** your VR application should call. All endpoints are authenticated with a shared API key (not end-user JWTs).

### Integration at a glance

```
┌─────────────────┐     x-meta-api-key      ┌──────────────────────────┐
│  Meta Quest VR  │ ───────────────────────▶│  Pixel Paddle API        │
│  Game Client    │                         │  /api/v1/integrations/   │
└─────────────────┘                         │  meta/*                  │
        │                                   └──────────────────────────┘
        │  userId (UUID) from web login
        ▼
   Player completes solo OR head-to-head match in VR
        │
        ├── Solo (waiting for opponent)  → POST /solo-target
        └── Paired match                 → POST /matches/:id/scores
```

### Typical player flow

1. Player logs in on the **web app** and enters a tournament (with or without a venue booking).
2. VR player joins the matchmaking queue (handled by web/worker — no Meta API call required).
3. **Optional — solo round:** While waiting in queue, player plays a solo innings in VR and submits their target score via `POST /solo-target`. This sets the chase target for when they are paired.
4. When paired, poll `GET /matches/current` to get match details (opponent, venue, chase target, role).
5. Both players complete the VR match and each submits **one score** via `POST /matches/:id/scores`.
6. When both scores are in, the server resolves the winner (including chase/rematch rules) and updates tournament standings.

---

## 2. Base URL & environments

| Environment | Base URL |
|-------------|----------|
| **Staging** | `https://[staging-host]/api/v1/integrations/meta` |
| **Production** | `https://[production-host]/api/v1/integrations/meta` |
| **Local dev** | `http://localhost:3000/api/v1/integrations/meta` |

> We will provide staging credentials and a test `userId` for joint integration testing.

All paths below are relative to `/api/v1/integrations/meta`.

---

## 3. Authentication

Every request **must** include the shared API key header:

| Header | Required | Description |
|--------|----------|-------------|
| `x-meta-api-key` | Yes | Shared secret issued by Pixel Paddle |
| `Content-Type` | Yes (POST) | `application/json` |
| `Accept` | Recommended | `application/json` |

**Example:**

```http
GET /api/v1/integrations/meta/matches/current?userId=8fe6f2c1-ea04-41a8-a076-8754a696bd16 HTTP/1.1
Host: api.pixelpaddle.example
x-meta-api-key: <your-api-key>
Accept: application/json
```

| Response if missing/invalid key | HTTP | Error code | Message |
|---------------------------------|------|------------|---------|
| No header or wrong key | `401` | `UNAUTHORIZED` | `Invalid Meta API key` |

**Security notes:**
- Store the API key securely on your backend or in the Quest app’s secure config — never embed in public repos.
- The API key identifies **your integration**, not the player. Player identity is passed as `userId` (UUID) in each request body/query.
- `userId` is the Pixel Paddle user UUID. Your app must obtain this after the player authenticates on web (e.g. deep link, QR code, account linking). We can provide a test account for staging.

---

## 4. Response envelope

All responses use the same JSON shape:

### Success

```json
{
  "success": true,
  "data": { },
  "error": null,
  "meta": {}
}
```

### Error

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": {}
  },
  "meta": {}
}
```

### Common HTTP status codes

| Status | Meaning |
|--------|---------|
| `200` | Success (GET, score submit when match still in progress) |
| `201` | Created (solo target submitted) |
| `400` | Validation error (malformed body/query) |
| `401` | Invalid or missing API key |
| `403` | User not allowed (e.g. not a match participant) |
| `404` | Resource not found |
| `409` | Business rule conflict (duplicate score, slot ended, not in queue, etc.) |
| `429` | Rate limited |
| `500` | Server error |

---

## 5. Endpoints

There are **three** endpoints. The two primary ones for match play are **Get Current Match** and **Submit Score**. **Submit Solo Target** is used when a player plays alone while waiting for an opponent.

---

### 5.1 Get Current Match

Poll this endpoint when the player enters VR or between innings to discover queue state, active match, chase rules, and scores.

```
GET /matches/current?userId={userId}
```

#### Query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | UUID string | Yes | Pixel Paddle user ID |

#### Example request

```bash
curl -s "https://api.pixelpaddle.example/api/v1/integrations/meta/matches/current?userId=8fe6f2c1-ea04-41a8-a076-8754a696bd16" \
  -H "x-meta-api-key: YOUR_KEY" \
  -H "Accept: application/json"
```

#### Example response — player in queue, no active match

```json
{
  "success": true,
  "data": {
    "inQueue": true,
    "queueSize": 3,
    "canSubmitSoloTarget": true,
    "soloTarget": null,
    "match": null
  },
  "error": null,
  "meta": {}
}
```

#### Example response — active paired match (chase mode)

```json
{
  "success": true,
  "data": {
    "inQueue": false,
    "queueSize": null,
    "canSubmitSoloTarget": false,
    "soloTarget": 87,
    "match": {
      "id": "1a911c21-85fb-435b-84d2-3f7a9c4e12ab",
      "status": "confirmed",
      "opponent": {
        "id": "b2cb72e1-d9b7-479c-b70b-80eb552a83cd",
        "username": "player5_queued",
        "skillTier": 3
      },
      "venue": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "VR Arena Karachi",
        "city": "Karachi"
      },
      "slot": {
        "id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
        "startTime": "2026-06-22T14:00:00.000Z",
        "endTime": "2026-06-22T15:00:00.000Z"
      },
      "chaseTarget": 87,
      "amChasing": true,
      "myScore": null,
      "opponentScore": null,
      "scheduledAt": "2026-06-22T14:00:00.000Z"
    }
  },
  "error": null,
  "meta": {}
}
```

#### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `inQueue` | boolean | `true` if player is waiting for an opponent |
| `queueSize` | number \| null | Players in the same tournament queue (null if not queued) |
| `canSubmitSoloTarget` | boolean | `true` if player may call `POST /solo-target` now |
| `soloTarget` | number \| null | Target already submitted from a solo round |
| `match` | object \| null | Active match details, or `null` if none |

#### `match` object (when present)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Match ID — use in `POST /matches/:id/scores` |
| `status` | string | `confirmed` or `in_progress` (playable states) |
| `opponent` | object | `{ id, username, skillTier }` |
| `venue` | object \| null | Venue name/city for display or routing |
| `slot` | object \| null | Booked time window (`startTime`, `endTime` ISO 8601) |
| `chaseTarget` | number \| null | Runs to chase (null = standard highest-score-wins) |
| `amChasing` | boolean | `true` if **this player** must beat `chaseTarget` to win |
| `myScore` | number \| null | Score already submitted by this player |
| `opponentScore` | number \| null | Opponent’s submitted score |
| `scheduledAt` | string \| null | Scheduled start (ISO 8601) |

#### Match status values (reference)

| Status | Playable via Meta? | Meaning |
|--------|-------------------|---------|
| `confirmed` | Yes | Match ready — tournament matches are auto-confirmed |
| `in_progress` | Yes | One score submitted; waiting for the other |
| `pending_confirmation` | No | Legacy/manual confirm flow (not used for tournament VR) |
| `completed` | No | Match finished |
| `cancelled` | No | Match cancelled (e.g. rematch scheduled) |
| `expired` | No | Slot ended without scores |

#### Polling recommendation

- Poll every **2–5 seconds** while in queue or in an active match.
- Stop aggressive polling once `match.status` is `completed` or `cancelled`.
- Use `canSubmitSoloTarget` to decide whether to show the solo innings UI.

---

### 5.2 Submit Match Score

Each player submits **exactly one score per match**. Web score entry is disabled.

```
POST /matches/{matchId}/scores
```

#### Path parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `matchId` | UUID | From `GET /matches/current` → `data.match.id` |

#### Request body

```json
{
  "userId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
  "score": 42
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `userId` | UUID | Yes | Must be a participant in this match |
| `score` | integer | Yes | `0` – `999` inclusive |

#### Example request

```bash
curl -s -X POST "https://api.pixelpaddle.example/api/v1/integrations/meta/matches/1a911c21-85fb-435b-84d2-3f7a9c4e12ab/scores" \
  -H "x-meta-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"8fe6f2c1-ea04-41a8-a076-8754a696bd16","score":95}'
```

#### Behaviour

1. **First score from either player** → match moves to `in_progress`. Response returns full match object with one score set.
2. **Second score** → server applies win/loss/chase/rematch rules (see §6). Response returns match with final `status` (`completed` or `cancelled` for rematch).
3. **Duplicate submission** → `409` — each player may only submit once.
4. **After booked slot end time** → `409` — `Match slot has ended — scores cannot be submitted`.

#### Example response — waiting for opponent’s score

```json
{
  "success": true,
  "data": {
    "id": "1a911c21-85fb-435b-84d2-3f7a9c4e12ab",
    "tournamentId": "d8b8fa1a-72bf-4547-8009-050f56589bf3",
    "player1Id": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
    "player2Id": "b2cb72e1-d9b7-479c-b70b-80eb552a83cd",
    "status": "in_progress",
    "result": {
      "player1Score": 95,
      "player2Score": null,
      "winnerId": null,
      "chaseTarget": 87,
      "chasePlayerId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
      "source": "meta"
    },
    "player1": { "id": "...", "username": "player20", "skillTier": 3, "hasVrHeadset": true },
    "player2": { "id": "...", "username": "player5_queued", "skillTier": 3, "hasVrHeadset": true },
    "venue": { "id": "...", "name": "VR Arena Karachi", "city": "Karachi", "address": "..." },
    "slot": { "id": "...", "startTime": "2026-06-22T14:00:00.000Z", "endTime": "2026-06-22T15:00:00.000Z" }
  },
  "error": null,
  "meta": {}
}
```

#### Example response — match completed

```json
{
  "success": true,
  "data": {
    "id": "1a911c21-85fb-435b-84d2-3f7a9c4e12ab",
    "status": "completed",
    "result": {
      "player1Score": 95,
      "player2Score": 72,
      "winnerId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
      "chaseTarget": 87,
      "chasePlayerId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
      "source": "meta",
      "outcome": "win"
    }
  },
  "error": null,
  "meta": {}
}
```

#### Error responses

| HTTP | Code | Message | When |
|------|------|---------|------|
| `400` | `VALIDATION_ERROR` | Various | Invalid UUID, score out of range, malformed JSON |
| `403` | `FORBIDDEN` | `User is not a participant in this match` | Wrong `userId` for this match |
| `404` | `NOT_FOUND` | `Match not found` | Invalid `matchId` |
| `409` | `CONFLICT` | `Match is not currently playable` | Status not `confirmed`/`in_progress` |
| `409` | `CONFLICT` | `Player 1 score already submitted` / `Player 2 score already submitted` | Duplicate submit |
| `409` | `CONFLICT` | `Match slot has ended — scores cannot be submitted` | Past slot `endTime` |

---

### 5.3 Submit Solo Target

Used when a player plays a **solo innings** while in the matchmaking queue (before or between paired matches). The target becomes input for chase pairing logic.

```
POST /solo-target
```

#### Request body

```json
{
  "userId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
  "tournamentId": "d8b8fa1a-72bf-4547-8009-050f56589bf3",
  "target": 87
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `userId` | UUID | Yes | Player submitting the solo score |
| `tournamentId` | UUID | Yes | Tournament they are queued for |
| `target` | integer | Yes | Solo innings score, `0` – `999` |

#### Example request

```bash
curl -s -X POST "https://api.pixelpaddle.example/api/v1/integrations/meta/solo-target" \
  -H "x-meta-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"8fe6f2c1-ea04-41a8-a076-8754a696bd16","tournamentId":"d8b8fa1a-72bf-4547-8009-050f56589bf3","target":87}'
```

#### Example response — `201 Created`

```json
{
  "success": true,
  "data": {
    "target": 87,
    "soloPlayedAt": "2026-06-22T13:45:12.345Z",
    "inQueue": true
  },
  "error": null,
  "meta": {}
}
```

#### Preconditions (all must be true)

| Rule | Error if violated |
|------|-------------------|
| Player is in matchmaking queue | `409` — `Player must be in queue to submit a solo target` |
| No active match (`pending_confirmation`, `confirmed`, `in_progress`) | `409` — `Cannot submit solo target while in an active match` |
| Active tournament participant | `403` — `Not an active tournament participant` |
| Participant status `active` or `advanced` | `403` — `Participant is not active in this round` |
| Round still open | `409` — `Round has ended` |
| Booked slot not expired (if player has a booking) | `409` — `Your booked slot has ended` |

#### Important behaviour

- Solo play **does not advance** the player in the tournament by itself — it only records a target and keeps them in queue.
- After submit, matchmaking is triggered immediately to find an opponent.
- When paired, the **earlier solo timestamp** sets the chase target; the other player chases that score (see §6).

#### When to show solo UI

Call `GET /matches/current` and check:

```json
{
  "inQueue": true,
  "canSubmitSoloTarget": true,
  "soloTarget": null,
  "match": null
}
```

If `canSubmitSoloTarget` is `true` and `soloTarget` is `null`, prompt the player to play solo and then call `POST /solo-target`.

---

## 6. Game rules (for VR logic & UI)

### 6.1 Chase mode

When one or both players submitted a solo target before pairing:

| Field | Meaning |
|-------|---------|
| `chaseTarget` | Runs the chaser must exceed to win |
| `amChasing` | Whether the current player is the chaser |

**Chase resolution (when both scores submitted):**

| Condition | Result |
|-----------|--------|
| Chaser score **>** `chaseTarget` | Chaser wins |
| Chaser score **≤** `chaseTarget` | Setter (non-chaser) wins |
| Chaser score **=** setter score | **Rematch** — match `cancelled`, both re-queued |

If both players had solo targets, the **earlier** `soloPlayedAt` timestamp sets the chase; the other player chases.

### 6.2 Standard mode (no chase)

When `chaseTarget` is `null`:

| Condition | Result |
|-----------|--------|
| Higher score wins | Winner advanced, loser eliminated (normal rounds) |
| Equal scores | **Rematch** — both re-queued |

### 6.3 Rematch

On rematch (`status: cancelled`, `result.outcome: rematch`):

- Poll `GET /matches/current` again — players return to queue.
- A new match will be created when the pairing worker runs.
- Submit scores only to the **new** `match.id`.

### 6.4 Time windows

- Scores can only be submitted while the match’s booked slot `endTime` is in the future.
- Players should complete VR play within their venue slot window.

---

## 7. Recommended VR client flow

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Obtain userId (from web login / account link)             │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. GET /matches/current?userId=...                           │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
              ┌──────────────┴──────────────┐
              │                               │
     match == null                    match != null
     inQueue && canSubmitSoloTarget          │
              │                               │
              ▼                               ▼
   Play solo → POST /solo-target     Play head-to-head
              │                     POST /matches/:id/scores
              │                               │
              └──────────────┬────────────────┘
                             ▼
              Poll GET /matches/current until
              match completed / cancelled / back in queue
```

### Score submission checklist

- [ ] Use `match.id` from current-match response (do not cache stale IDs after rematch).
- [ ] Submit each player’s score **once**.
- [ ] Display chase UI when `chaseTarget != null` (show target, show `amChasing`).
- [ ] Handle `409` duplicate gracefully (score already recorded).
- [ ] Handle slot-ended `409` with a user-visible message.

---

## 8. Integration testing

### Staging credentials (to be provided)

| Item | Value |
|------|-------|
| API base URL | `https://[staging]/api/v1/integrations/meta` |
| `x-meta-api-key` | Issued separately (not in this doc) |
| Test user email | `player20@vrtournament.com` |
| Test password (web login) | `password123` |
| Test `userId` | Provided after first login / admin export |

### Suggested test scenarios

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Auth failure | Call any endpoint without API key | `401` |
| 2 | Queue poll | Login on web, join tournament queue, GET current | `inQueue: true` |
| 3 | Solo target | While queued, POST solo-target | `201`, `canSubmitSoloTarget` becomes false |
| 4 | Pairing | Second test user joins queue | GET current returns `match` with `chaseTarget` |
| 5 | Partial score | Player A POST score | `in_progress`, one score set |
| 6 | Complete match | Player B POST score | `completed`, `winnerId` set |
| 7 | Duplicate score | Same player POST again | `409` |
| 8 | Wrong user | POST score with non-participant userId | `403` |
| 9 | Chase win | Chaser score > chaseTarget | Chaser in `winnerId` |
| 10 | Chase tie | Chaser score == setter score | `cancelled`, rematch / re-queue |

### Health check (optional)

```bash
curl -s https://api.pixelpaddle.example/health
# {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

---

## 9. Rate limits & reliability

| Limit | Value (production) |
|-------|-------------------|
| General API (per IP) | ~20 requests / minute |
| Recommendation | Poll current match at most every 2–5s; batch score submits once per player |

On `429 RATE_LIMITED`, back off exponentially and retry.

**Idempotency:** Score submit is idempotent in the sense that a duplicate returns `409` rather than double-counting. Do not retry `409` duplicate errors with a new score.

---

## 10. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | June 2026 | Initial Meta integration: current match, score submit, solo target |

---

## 11. Open questions / coordination

Please confirm with our team before go-live:

1. **How will the Quest app obtain `userId`?** (OAuth, deep link from web, manual entry for pilot?)
2. **Staging schedule** for paired testing with two headsets.
3. **Error telemetry** — will you send us correlation IDs on failed requests?
4. **Production API key** rotation process.

---

*Document generated from Pixel Paddle API implementation (`apps/api/src/modules/integrations/`). For technical questions, contact the Pixel Paddle engineering team.*
