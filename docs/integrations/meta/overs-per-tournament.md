# Overs per tournament: headset changes (API v2.6)

**For:** the VR (Meta Quest) development team
**Date:** 21 November 2026
**Status:** additive. Nothing existing is removed or renamed, so current headset builds keep working.

---

## 1. What changed

Until now every match was **one over** (6 balls). From v2.6, the admin sets the number of overs for each tournament when creating it:

- Any whole number from **1 to 20**. The admin form offers 1, 5, 10 and 20 as quick picks, plus a custom box.
- **Every match in every round of a tournament uses the same overs.**
- Overs are **locked once the tournament starts**, so they can't change mid-tournament.
- An innings is **purely overs**: no wickets limit. The batter faces every ball of every over.
- All tournaments created before this change are **1 over**.

`ballsPerInnings` is always `overs × 6`. It's sent alongside `overs` so the headset doesn't have to work it out.

---

## 2. What the headset must do

1. **Before starting an innings, read `match.overs` (or `match.ballsPerInnings`) from `GET /matches/current`** and set up the innings for that many overs. This is the only required change.
2. If the field is missing (for example, an older server), use **1 over**.
3. Show the format on the match and tournament screens, for example **"5 overs a side"**.
4. Optional: send `ballsFaced` with the score (see §4).

---

## 3. Response changes

All requests and headers are unchanged (`x-meta-api-key` / `x-meta-ssh-public-key`).

### 3.1 `GET /matches/current`: `match` and every item in `matches[]`

| Field | Type | Description |
|-------|------|-------------|
| `overs` | integer, 1–20 | Overs per innings for **this match**. Use this to set up the innings. |
| `ballsPerInnings` | integer, 6–120 | `overs × 6`. |

Full response (new fields: `overs`, `ballsPerInnings`):

```json
{
  "success": true,
  "data": {
    "inQueue": false,
    "tournamentId": "0c160535-eddf-45ab-a1f9-0040316b4f63",
    "canSubmitSoloTarget": false,
    "soloTargetState": "in_match",
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
      "startTime": "2026-11-22T12:00:00.000Z",
      "endTime": "2026-11-22T18:00:00.000Z",
      "chaseTarget": -1,
      "amChasing": false,
      "amSettingTarget": true,
      "myScore": -1,
      "opponentScore": -1,
      "waitingForOpponent": false
    },
    "lastResult": null,
    "matches": [
      {
        "id": "8f0f8a2e-2a7e-4c55-9d0f-6d1c2b7f4a11",
        "tournamentId": "0c160535-eddf-45ab-a1f9-0040316b4f63",
        "tournamentName": "Lahore VR Championship",
        "roundLabel": "Quarter-final",
        "overs": 5,
        "ballsPerInnings": 30,
        "opponent": "ali_khan",
        "state": "your_turn",
        "deadline": "2026-11-22T18:00:00.000Z"
      }
    ]
  }
}
```

`match.status` is `confirmed` until someone bats, then `in_progress` until the match is decided.

`matches[].state` says whether this player still has to bat in that match (`your_turn`) or already has (`waiting_for_opponent`). It stays `your_turn` while the opponent is batting first. To decide whether the player may bat **right now**, use the `match` flags below.

`canSubmitSoloTarget` and `soloTargetState` are still sent on every response. Solo target is not used in tournaments, so `canSubmitSoloTarget` is always `false`, and `soloTargetState` is `in_match`, `waiting_for_opponent` or `not_queued`. Use `amSettingTarget` (bat first), `amChasing` plus `chaseTarget` (chase), and `waitingForOpponent` (wait and keep polling) to drive the innings.

A player can be in several tournaments with **different overs**, so always read `overs` from the match being played, never from a tournament the player saw earlier.

### 3.2 `GET /tournaments/live`: each item in `tournaments[]`

The full summary of each live tournament, for the Tournament screen.

| Field | Type | Description |
|-------|------|-------------|
| `overs` | integer, 1–20 | Overs per innings in this tournament. |
| `ballsPerInnings` | integer | `overs × 6`. |
| `playerCount` | integer | Players registered. |
| `maxPlayers` | integer or `null` | Player limit; `null` means no limit. |
| `roundDurationMinutes` | integer | How long each round stays open for play. |
| `currentRoundNumber` | integer or `null` | The round being played; `null` until the tournament starts. |
| `roundClosesAt` | ISO-8601 UTC or `null` | When the current round closes; `null` until the tournament starts. |

```json
{
  "id": "0c160535-eddf-45ab-a1f9-0040316b4f63",
  "name": "Lahore VR Championship",
  "status": "in_progress",
  "startDate": "2026-11-21T12:00:00.000Z",
  "endDate": "2026-11-23T18:00:00.000Z",
  "registrationOpen": false,
  "overs": 5,
  "ballsPerInnings": 30,
  "playerCount": 16,
  "maxPlayers": 16,
  "roundDurationMinutes": 180,
  "currentRoundNumber": 2,
  "roundClosesAt": "2026-11-21T18:00:00.000Z"
}
```

### 3.3 `GET /players/profile`: each item in `tournaments[]`

This is the same card that `POST /identity/verify-link-code` returns as `player`.

| Field | Type | Description |
|-------|------|-------------|
| `overs` | integer, 1–20 | Overs per innings in this tournament. |
| `ballsPerInnings` | integer | `overs × 6`. |

---

## 4. Submitting a score: optional `ballsFaced`

`POST /matches/:matchId/scores` accepts one new **optional** field:

```json
{ "userId": "3f6c…", "score": 41, "ballsFaced": 30 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ballsFaced` | integer, 0–120 | No | Legal balls the batter faced. Stored so we can check innings length. |

**A score is never rejected because of `ballsFaced`.** Leaving it out is fine. Scores are also **not capped** by overs, because extras (wides, no-balls) make any fixed maximum unreliable.

---

## 5. Timing: the turn hold is longer for longer innings

When neither player has batted, the first player to open the match "holds the turn" and the other waits. The hold used to last 10 minutes. It now grows with the overs:

| Overs | Hold before the turn can pass to the opponent |
|------:|------|
| 1 | 10 minutes (unchanged) |
| 5 | 26 minutes |
| 10 | 46 minutes |
| 20 | 86 minutes |

The rule is 10 minutes, plus 4 minutes for each over after the first. No headset change is needed; this is only so the team knows a long innings won't lose its turn mid-play.

---

## 6. Checklist for the VR build

- [ ] Read `match.overs` / `match.ballsPerInnings` from `GET /matches/current` before every innings, and set the innings to that length.
- [ ] Default to 1 over when the field is missing.
- [ ] Show "N overs a side" on the match screen, and on the Tournament screen using `GET /tournaments/live`.
- [ ] Optional: show the round, player count and round closing time from `GET /tournaments/live`.
- [ ] Optional: send `ballsFaced` with the score.

To test with more than one over, ask the Pixel Paddle team to create a tournament with, for example, 2 overs.
