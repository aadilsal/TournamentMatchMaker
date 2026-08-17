# Pixel Paddle / VR Cricket League — Meta Quest Integration API

**Version:** 2.3  
**Last updated:** August 2026  
**Audience:** Meta Quest / VR game integration team  
**Contact:** aadilsalman786@gmail.com

---

## 1. Overview

Pixel Paddle is a tournament matchmaking platform. Players register on the web, join tournaments, book venue slots, and get paired for VR cricket matches. **Scores and solo targets must be submitted from the Meta Quest headset** — the web app does not accept manual scores.

This document describes the **server-to-server HTTP API** your VR application should call. All endpoints are authenticated with a shared API key or a shared SSH public key (not end-user JWTs).

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
5. Each player submits **one score in total** via `POST /matches/:id/scores` — and a solo target already counts as that player's score. So a **chase** takes one submission (the chaser's; the setter's target is already on the board), while a **standard** match takes two.
6. Once the second half of the scoreline is in, the server resolves the winner (including chase/rematch rules) and updates tournament standings.

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

Every request **must** include at least one of the shared authentication headers:

| Header | Required | Description |
|--------|----------|-------------|
| `x-meta-api-key` | Yes* | Shared secret issued by Pixel Paddle |
| `x-meta-ssh-public-key` | Yes* | Shared SSH public key issued by Pixel Paddle |
| `Content-Type` | Yes (POST) | `application/json` |
| `Accept` | Recommended | `application/json` |

*At least one of the two headers must be present and match the configured value.

**Example:**

```http
GET /api/v1/integrations/meta/matches/current?userId=8fe6f2c1-ea04-41a8-a076-8754a696bd16 HTTP/1.1
Host: api.pixelpaddle.example
x-meta-api-key: c992d7bd6b13bf4220bde1e52d6b76c05abb2170ad3eaed4
x-meta-ssh-public-key: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDQtYp3sfaQfsRelTWXbdnikbVItI91dIu4lvnpcK0Od meta-integration@vrtournament
Accept: application/json
```

| Response if missing/invalid key | HTTP | Error code | Message |
|---------------------------------|------|------------|---------|
| No matching header or wrong value | `401` | `UNAUTHORIZED` | `Invalid Meta API key or SSH public key` |

**Security notes:**
- Store the shared values securely on your backend or in the Quest app’s secure config — never embed in public repos.
- The API key and SSH public key identify **your integration**, not the player. Player identity is passed as `userId` (UUID) in each request body/query.
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

There are **five** endpoints. The two primary ones for match play are **Get Current Match** and **Submit Score**. **Submit Solo Target** is used when a player plays alone while waiting for an opponent. The **Identity** endpoint (`verify-link-code`, §5.4) lets the Quest app resolve a player's `userId` using a short-lived 4-digit code shown on the user's web profile.

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
    "tournamentId": "d8b8fa1a-72bf-4547-8009-050f56589bf3",
    "canSubmitSoloTarget": true,
    "soloTargetState": "available",
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
    "tournamentId": "d8b8fa1a-72bf-4547-8009-050f56589bf3",
    "canSubmitSoloTarget": false,
    "soloTargetState": "in_match",
    "match": {
      "id": "1a911c21-85fb-435b-84d2-3f7a9c4e12ab",
      "opponent": "player5_queued",
      "venue": "VR Arena Karachi",
      "startTime": "2026-06-22T14:00:00.000Z",
      "endTime": "2026-06-22T15:00:00.000Z",
      "chaseTarget": 87,
      "amChasing": true,
      "amSettingTarget": false,
      "myScore": null,
      "opponentScore": 87
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
| `tournamentId` | UUID \| null | Tournament the player is queued for / playing in. **Pass this to `POST /solo-target`** — do not hard-code or cache it. `null` when the player is neither queued nor in a match. |
| `canSubmitSoloTarget` | boolean | `true` if player may call `POST /solo-target` now |
| `soloTargetState` | string | Why `canSubmitSoloTarget` reads as it does — see below. `"available"` exactly when it is `true`. |
| `match` | object \| null | Active match details, or `null` if none |

#### `soloTargetState` values

`canSubmitSoloTarget` is one bit covering several different situations. Use this
field to tell a wait apart from a refusal — `round_closed` resolves on its own
within seconds, the rest do not.

| Value | Meaning | What to show |
|-------|---------|--------------|
| `available` | Solo innings is playable now | The solo innings UI |
| `in_match` | Holding a match, including one awaiting confirmation | The match, not the solo UI |
| `not_queued` | Not in any matchmaking queue | Prompt to join a tournament |
| `not_participant` | Queued, but not as an active participant of a tournament round | Neutral idle state |
| `already_played` | This round's innings is already recorded | "Waiting for an opponent" |
| `round_closed` | The round window has ended; the next round opens shortly | "Round changing over" — keep polling |

#### `match` object (when present)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Match ID — use in `POST /matches/:id/scores` |
| `opponent` | string | Opponent’s username (display only) |
| `venue` | string \| null | Venue name for display |
| `startTime` | string \| null | Booked slot start (ISO 8601) |
| `endTime` | string \| null | Booked slot end (ISO 8601) — scores must be submitted before this |
| `chaseTarget` | number \| null | Runs to chase (null = standard highest-score-wins) |
| `amChasing` | boolean | `true` if **this player** must beat `chaseTarget` to win |
| `amSettingTarget` | boolean | `true` if nothing is on the board yet and this player bats first — their score becomes the total the opponent must beat. Mutually exclusive with `amChasing`. |
| `myScore` | number \| null | This player’s score, or null if their innings is still to play. In a chase the setter’s solo target is already here from the moment they are paired. |
| `opponentScore` | number \| null | Opponent’s score — for a chaser, this is the setter’s target, present from the start |

`match` is non-null **only** while the match is playable. Once it completes, is cancelled
(rematch), or expires, `match` becomes `null` again — there is no status field to inspect.

#### Which innings am I playing?

The three fields below are enough to pick the UI; you never need to infer state from scores.

| `chaseTarget` | `amChasing` | `amSettingTarget` | Show |
|---|---|---|---|
| number | `true` | `false` | **Chase** — beat `chaseTarget` to win. Submit one score; it completes the match |
| number | `false` | `false` | **Defend** — opponent is chasing your target. Nothing to submit: `myScore` already holds your solo target. Poll until `match` goes `null` |
| `null` | `false` | `true` | **Bat first** — your score sets the total |
| `null` | `false` | `false` | **Standard** — highest score wins; check `opponentScore` |

A defending player must not be shown a score-entry screen: their innings was the
solo one they already played, and `POST /matches/:id/scores` answers `409` for
them. Only `amChasing` and `amSettingTarget`/standard players ever submit.

#### Polling recommendation

- Poll every **2–5 seconds** while in queue or in an active match.
- `match !== null` → play head-to-head. `match === null` → back to queue / idle.
- Use `myScore !== null` to know this player’s score is already recorded.
- Use `canSubmitSoloTarget` to decide whether to show the solo innings UI.

#### Two states that surprise integrators

**A player can hold more than one playable match.** This endpoint returns the most
recent one. Always re-read `match.id` from the latest poll before submitting a score —
never cache it across polls. After a match completes, the next poll may immediately
return a *different* match rather than `null`.

**`inQueue: true` with `canSubmitSoloTarget: false` is normal.** It means the player is
queued but may not play a solo innings right now — they already recorded a target this
round, the round has closed, or they are holding a match that is not yet playable. Read
`soloTargetState` for which of those it is; do not retry `POST /solo-target` to find out.

**`canSubmitSoloTarget` can go `true` → `false` → `true` on its own.** A round ends at a
fixed time and the next one opens moments later, so a poll either side of that boundary
answers differently with the player having done nothing. It is a changeover, not an
error: `soloTargetState` reads `round_closed` throughout, and it clears within seconds.
Keep polling and leave whatever the player is looking at on screen.

---

### 5.2 Submit Match Score

Each player submits **at most one score per match**, and a solo target already
counts as that player's score. In a chase (`chaseTarget != null`) only the
**chaser** submits — that single score completes the match. Web score entry is
disabled.

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

1. **Chase match, chaser submits** → both halves of the scoreline are now in (the setter's half is their solo target), so the server resolves the match immediately: `completed`, or `cancelled` for a rematch tie. This is the **only** submission a chase match takes.
2. **Chase match, setter submits** → `409`. Their solo innings is already recorded as their score; they never bat twice.
3. **Standard match, first score from either player** → match moves to `in_progress`. Response returns the full match object with one score set.
4. **Standard match, second score** → server applies win/loss/rematch rules (see §6). Response returns match with final `status` (`completed` or `cancelled` for rematch).
5. **Duplicate submission** → `409` — each player may only submit once.
6. **After booked slot end time** → `409` — `Match slot has ended — scores cannot be submitted`.

#### Example response — waiting for opponent’s score (standard match; a chase never reaches this state)

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
      "chaseTarget": null,
      "chasePlayerId": null,
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

#### Example response — chase completed by the chaser’s single score

Player 1 is the chaser and submits `95` against a target of `87`. Player 2 never
submits anything: their `87` is the solo innings they played before pairing, put
on the board when the match was created.

```json
{
  "success": true,
  "data": {
    "id": "1a911c21-85fb-435b-84d2-3f7a9c4e12ab",
    "status": "completed",
    "result": {
      "player1Score": 95,
      "player2Score": 87,
      "winnerId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
      "chaseTarget": 87,
      "chasePlayerId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
      "source": "meta",
      "outcome": "player1_win"
    }
  },
  "error": null,
  "meta": {}
}
```

> **`outcome` describes the match, not the caller.** `player1_win` / `player2_win`
> name the winning side of the match — they are **not** relative to the `userId`
> you posted. Submitting a losing chase returns `player2_win` (the setter's win)
> to the chaser. To answer *"did my player win?"*, compare
> `result.winnerId === userId`; never read `outcome` for that.
>
> Matches decided before this change store a flat `"outcome": "win"`, which names
> no side at all — read `winnerId` for those.

#### Error responses

| HTTP | Code | Message | When |
|------|------|---------|------|
| `400` | `VALIDATION_ERROR` | `Invalid request data` | `matchId` or `userId` not a UUID, `score` not an integer `0`–`999`, malformed JSON |
| `403` | `FORBIDDEN` | `User is not a participant in this match` | Wrong `userId` for this match |
| `404` | `NOT_FOUND` | `Match not found` | Well-formed `matchId` that does not exist (e.g. cached across a rematch) |
| `409` | `CONFLICT` | `Match is not currently playable` | Status not `confirmed`/`in_progress` |
| `409` | `CONFLICT` | `Player 1 score already submitted` / `Player 2 score already submitted` | Duplicate submit |
| `409` | `CONFLICT` | `Your solo target is already recorded as your score for this match — only the chaser submits` | The target-setter tried to submit in a chase match |
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
| `tournamentId` | UUID | Yes | Tournament they are queued for — take it from `GET /matches/current` → `data.tournamentId` |
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
| No target recorded yet this round | `409` — `Solo target already submitted for this round` |
| *(all of the above are already reflected in `canSubmitSoloTarget` — if it is `true`, this call will not fail on a precondition)* | |
| Active tournament participant | `403` — `Not an active tournament participant` |
| Participant status `active` or `advanced` | `403` — `Participant is not active in this round` |
| Round still open | `409` — `Round has ended` |
| Booked slot not expired (if player has a booking) | `409` — `Your booked slot has ended` |
| `target` is an integer `0`–`999` | `400` — `Invalid request data` |

#### Important behaviour

- Solo play **does not advance** the player in the tournament by itself — it only records a target and keeps them in queue.
- After submit, matchmaking is triggered immediately to find an opponent.
- When paired, the **earlier solo timestamp** sets the chase target; the other player chases that score (see §6).
- **One innings per round.** A second submission is rejected with `409` and the stored
  target is left untouched. Retrying a request that timed out is therefore safe — treat
  `409 Solo target already submitted for this round` as "already recorded", not a failure,
  and never retry with a different score.

#### When to show solo UI

Call `GET /matches/current` and check:

```json
{
  "inQueue": true,
  "tournamentId": "d8b8fa1a-72bf-4547-8009-050f56589bf3",
  "canSubmitSoloTarget": true,
  "soloTargetState": "available",
  "match": null
}
```

If `canSubmitSoloTarget` is `true`, prompt the player to play solo and then call `POST /solo-target`, passing the **`tournamentId` from this same response**. `canSubmitSoloTarget` flips to `false` once a target has been recorded, so no separate check is needed. If it is `false`, `soloTargetState` says why — `round_closed` is a changeover worth waiting out, the rest are not.

---

### 5.4 Identity — verify 4-digit link code

Use this flow to securely link a headset to a player's account. The player views a randomly generated 4-digit code on their Pixel Paddle web profile and types it into the VR game. On success, the backend invalidates the code and returns the player's `userId` and `username`.

```
Quest app                         Pixel Paddle API
   │  player enters 4-digit code        │
   │ ─ POST /identity/verify-link-code ─▶│  verifies code
   │ ◀───────────── userId ─────────────│
```

Key rules:
- The code is exactly **4 numeric digits**.
- Codes expire after **10 minutes**.
- A successful verification **consumes** the code (it cannot be reused).
- The player must generate the code by viewing their profile on the web app while logged in.

This endpoint requires the standard `x-meta-api-key` / `x-meta-ssh-public-key` headers.

#### 5.4.1 Verify Link Code

```
POST /identity/verify-link-code
```

##### Request body

```json
{ "code": "8241" }
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `code` | string | Yes | Exactly 4 digits |

##### Example request

```bash
curl -s -X POST "https://api.pixelpaddle.example/api/v1/integrations/meta/identity/verify-link-code" \
  -H "x-meta-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code":"8241"}'
```

##### Example response — `200 OK`

```json
{
  "success": true,
  "data": {
    "userId": "8fe6f2c1-ea04-41a8-a076-8754a696bd16",
    "username": "player20"
  },
  "error": null,
  "meta": {}
}
```

##### Response fields

| Field | Type | Description |
|-------|------|-------------|
| `userId` | UUID | **The Pixel Paddle user ID** — store it and use in all other endpoints |
| `username` | string | Player's display name |

##### Errors

| HTTP | Code | Message | When |
|------|------|---------|------|
| `400` | `VALIDATION_ERROR` | Invalid request data | `code` not 4 digits |
| `400` | `CODE_INVALID` | `This code has expired or is invalid...` | Code expired (>10 min), was already used, or never existed |

##### Recommended VR handling

- Show a numeric keypad for entering a 4-digit code.
- If `CODE_INVALID` is returned, prompt the user to refresh their web profile to get a new code.
- Cache the returned `userId` on the device so this flow is only needed once (until logout/unlink).

---

## 6. Game rules (for VR logic & UI)

### 6.1 Chase mode

When one or both players submitted a solo target before pairing:

| Field | Meaning |
|-------|---------|
| `chaseTarget` | Runs the chaser must exceed to win |
| `amChasing` | Whether the current player is the chaser |

The format is **asynchronous**: the setter played their innings alone, before the
pair existed, and that innings *is* the target. So the match is created with the
setter's score already on the board (`myScore` for them, `opponentScore` for the
chaser) and only the chaser has an innings left to play. The two never have to be
in VR at the same moment.

**Chase resolution (on the chaser's score):**

| Condition | Result | `result.outcome` |
|-----------|--------|------------------|
| Chaser score **>** `chaseTarget` | Chaser wins | `player1_win` / `player2_win` — whichever side the chaser is |
| Chaser score **<** `chaseTarget` | Setter (non-chaser) wins | `player1_win` / `player2_win` — whichever side the setter is |
| Chaser score **=** `chaseTarget` | **Rematch** — match `cancelled`, both re-queued | `rematch` |

The target must be **exceeded**, not matched. A chaser posting `70` against a
`chaseTarget` of `87` loses, and the response carries the **setter's** win — with
`winnerId` set to the setter, and `chaseTarget`/`player1Score`/`player2Score`
showing the full scoreline.

If both players had solo targets, the **earlier** `soloPlayedAt` timestamp sets the chase; the other player chases — their own earlier solo target is not carried into the match, they play a live chase innings against the target.

### 6.2 Standard mode (no chase)

When `chaseTarget` is `null`:

| Condition | Result |
|-----------|--------|
| Higher score wins | Winner advanced, loser eliminated (normal rounds) |
| Equal scores | **Rematch** — both re-queued |

### 6.3 Rematch

On rematch (score submit returns `status: cancelled`, `result.outcome: rematch`):

- Poll `GET /matches/current` again — `match` returns to `null` and `inQueue` becomes `true`.
- A new match will be created when the pairing worker runs.
- Submit scores only to the **new** `match.id`.

### 6.4 Time windows

- Scores can only be submitted while the match’s `endTime` is in the future.
- Players should complete VR play within their venue slot window.

### 6.5 Walkovers

A match can finish without your player ever submitting — and without their
opponent submitting either.

If a match runs out of time (its slot ends, or its round closes) with exactly
one score on the board, the player who batted **wins by walkover**: `status`
becomes `completed`, `winnerId` is set, and `result.walkover` is `true`. Only a
match with *no* score at all is `expired`.

This matters most in a chase, where the setter's innings goes on the board when
the pair is made: a chaser who never plays hands the setter the match. Nothing
is required of the client — just keep polling, and handle `match` going `null`
as usual.

### 6.6 Knockout matches

When a tournament reaches its bracket, matches are created **already confirmed**
and appear in `GET /matches/current` like any other. They carry no `venue`,
`startTime`, or `endTime` — a bracket match is played whenever both players are
ready, bounded only by the tournament's end date — and no `chaseTarget`, so both
players submit a score exactly as in standard mode.

An odd number of players leaves one with a **bye**: they play no match that
round and simply keep polling until their next opponent is drawn.

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
   Play solo → POST /solo-target     amChasing / standard:
              │                       play, POST /matches/:id/scores
              │                     defending (chaseTarget set, not chasing):
              │                       nothing to submit — just keep polling
              │                               │
              └──────────────┬────────────────┘
                             ▼
              Poll GET /matches/current until
              match == null (finished / rematch / back in queue)
```

### Score submission checklist

- [ ] Use `match.id` from the **latest** current-match response (a player can hold more than one match; never cache the id).
- [ ] Submit each player’s score **at most once** — and never for a defender (`chaseTarget` set, `amChasing: false`), whose solo target is already their score.
- [ ] Pick the innings UI from `chaseTarget` / `amChasing` / `amSettingTarget` (see §5.1).
- [ ] Handle `409` duplicate gracefully (score already recorded).
- [ ] Handle slot-ended `409` with a user-visible message.
- [ ] Handle `400 VALIDATION_ERROR` on a stale `match.id` by re-polling instead of retrying.

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
| 5 | Setter's view | Setter GET current after pairing | `amChasing: false`, `myScore` == their solo target, `opponentScore: null` |
| 6 | Chase completes on one score | Chaser POST score | `completed`, `winnerId` set; `match` no longer returned for either player |
| 7 | Duplicate score | Same player POST again | `409` |
| 8 | Wrong user | POST score with non-participant userId | `403` |
| 9 | Chase win | Chaser score > chaseTarget | Chaser in `winnerId` |
| 10 | Chase tie | Chaser score == chaseTarget | `cancelled`, rematch / re-queue |
| 10b | Setter cannot bat twice | Setter POST score in a chase | `409` — solo target already stands as their score |
| 11 | Stale match id | POST score to a malformed / unknown id | `400` then `404` — never `500` |
| 12 | Multi-headset venue | 3 userIds × 30 polls/min from one IP | No `429` |
| 13 | Link code replay | Verify the same code twice | `200` then `400 CODE_INVALID` |

### Conformance suite

Every scenario above is automated against a running API. From the repo root:

```bash
node scripts/qa-vr-api.mjs
```

It covers auth, payload shape, queue + solo target, active match and slot data, score
submission through to completion, link codes, the response envelope and rate limits —
96 assertions. Point it at another environment with `API_URL` and `META_API_KEY`.

### Health check (optional)

```bash
curl -s https://api.pixelpaddle.example/health
# {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

---

## 9. Rate limits & reliability

| Endpoint | Limit (production) | Bucket |
|----------|--------------------|--------|
| `GET /matches/current`, `POST /matches/:id/scores`, `POST /solo-target` | 240 requests / minute | **Per `userId`**, not per IP |
| `POST /identity/verify-link-code` | 10 requests / minute | Per IP |

Meta endpoints are metered **per player**, so several headsets at one venue sharing a
public IP do not compete for the same budget. A 2-second poll cadence costs 30 req/min
against a 240 budget, leaving ample headroom for score submits and retries.

The link-code endpoint is deliberately tight — it guards a 4-digit keyspace. Enter codes
on user action only; never probe it in a loop.

On `429 RATE_LIMITED`, back off exponentially and retry. The response carries a
`Retry-After` header (seconds) — honour it rather than guessing.

**Idempotency:** Score submit is idempotent in the sense that a duplicate returns `409` rather than double-counting. Do not retry `409` duplicate errors with a new score. The same holds for `POST /solo-target`.

**Concurrency:** Score submission is serialised per match. Both headsets finishing at the
same instant is the normal case, and both scores are always recorded — neither can
overwrite the other or leave the match unresolved. If one headset fires the same request
twice (a retry racing the original), exactly one returns `200` and the rest return `409`.
**A score submit that times out is safe to retry**: either the first attempt landed and you
get `409`, or it did not and the retry succeeds.

---

## 10. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.3 | August 2026 | **Added** §6.5 walkovers and §6.6 knockout matches. A match that runs out of time with one score on the board now completes as a walkover for the player who batted, instead of expiring and discarding a played innings. Knockout matches are created confirmed, so they reach the headset through `GET /matches/current` — previously the bracket was only visible on the web, and a bracket match was expired five minutes after it was created, unannounced, so no tournament could finish its bracket. An odd field now gives a bye rather than dropping the extra player out of the draw. |
| 2.2 | August 2026 | **Fixed:** a chase now completes on the chaser's score alone. The target-setter's solo innings is recorded as their score when the pair is made, so the scoreline is half-filled from the start (`myScore` for the setter, `opponentScore` for the chaser). Previously both scores were left null, and the match sat unresolved until the setter submitted a *second* innings that the "defend" UI never asks for — in practice until the round or slot expired. A setter who does submit now gets a `409` naming the reason. Chase matches created before this change still resolve on the chaser's submission. |
| 1.0 | June 2026 | Initial Meta integration: current match, score submit, solo target |
| 1.1 | July 2026 | Replaced email OTP with 4-digit profile code (`/identity/verify-link-code`) for linking headsets. |
| 2.1 | August 2026 | **Added** `soloTargetState` to `GET /matches/current` — the reason behind `canSubmitSoloTarget`, so a round changeover can be told apart from a refusal. Additive: `canSubmitSoloTarget` is unchanged and still authoritative. **Fixed:** a solo innings played in one round no longer blocks the next one (`POST /solo-target` answered `409 already submitted` for a round the player had never batted in), and a round changeover no longer strands players for up to a minute. |
| 2.0 | August 2026 | **Breaking:** slimmed down `GET /matches/current`. Removed `queueSize`, `soloTarget`, `match.status`, `match.scheduledAt`, and all internal IDs (`opponent.id`, `opponent.skillTier`, `venue.id`, `venue.city`, `slot.id`). `opponent` and `venue` are now plain strings; `slot` is flattened to `startTime` / `endTime`. `match` is non-null only while playable. **Added** top-level `tournamentId` so the Quest app can supply it to `POST /solo-target` without a second lookup, and `match.amSettingTarget` so the innings UI needs no inference. **Fixed:** `canSubmitSoloTarget` no longer returns `true` when an unplayable match would make `POST /solo-target` fail; a malformed `matchId` now returns `400` instead of `500`; Meta endpoints are metered per player rather than per IP so multiple headsets at one venue are not throttled. |

---

## 11. Open questions / coordination

Please confirm with our team before go-live:

1. **How will the Quest app obtain `userId`?** Recommended: the **4-digit profile code flow** (§5.4) — player opens their web profile, reads the 4-digit code, and enters it in the VR app to log in securely.
2. **Staging schedule** for paired testing with two headsets.
3. **Error telemetry** — will you send us correlation IDs on failed requests?
4. **Production API key** rotation process.

---

*Document generated from Pixel Paddle API implementation (`apps/api/src/modules/integrations/`). For technical questions, contact the Pixel Paddle engineering team.*
