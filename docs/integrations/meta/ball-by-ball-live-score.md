# Ball-by-ball live score: headset changes (API v2.8)

**For:** the VR (Meta Quest) development team
**Date:** 28 November 2026
**Status:** additive. Current headset builds keep working unchanged. Live scores appear on the website as soon as the headset starts sending balls.

---

## 1. Why

Today the website learns the score only when an innings ends. Fans, and the opponent who is waiting to chase, see nothing while the batter is playing.

From this version the headset sends **every ball as it happens**. The website shows it live to anyone watching:
- a live scoreboard;
- this over's balls;
- a commentary feed;
- FOUR and SIX celebrations.

The waiting opponent sees the score climb on their dashboard.

You only need **one new call**. Everything else stays as it is.

---

## 2. Where it fits

```
POST /matches/{matchId}/start        { "userId" }                 player presses PLAY
POST /matches/{matchId}/balls        { "userId", "balls": [ … ] } after EVERY ball   ← new
POST /matches/{matchId}/heartbeat    { "userId" }                 only if no ball for 30 seconds
POST /matches/{matchId}/scores       { "userId", "score", … }     innings finished (unchanged)
```

All requests use the usual headers (`x-meta-api-key` / `x-meta-ssh-public-key`), the same base URL and the same response envelope as the other headset calls.

---

## 3. `POST /matches/{matchId}/balls`

Send it **right after each ball is decided**: the runs are known, or the batter is out.

### Request

```json
{
  "userId": "8a3e…",
  "balls": [
    { "seq": 14, "runs": 4, "wicket": false, "totalRuns": 27, "wicketsLost": 1 }
  ]
}
```

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `userId` | UUID | yes | The batter. |
| `balls` | array, 1 to 120 items | yes | Usually one ball. More than one when catching up after a dropped connection (section 5). |
| `balls[].seq` | integer, 1 to balls per innings | yes | Ball number in this innings: the first ball is `1`. Over 2, ball 3 is `9`. Never reuse a number. |
| `balls[].runs` | integer, 0 to 6 | yes | Runs scored off this ball. `4` shows a FOUR celebration and `6` a SIX. |
| `balls[].wicket` | boolean | no, default `false` | `true` if the batter was out on this ball. |
| `balls[].totalRuns` | integer | yes | The innings total **after** this ball. |
| `balls[].wicketsLost` | integer | yes | Wickets lost **after** this ball. Send `0` if you do not track wickets. |

**Balls per innings** is `ballsPerInnings` from `/matches/current` or `/start`: 6 for 1 over, up to 120 for 20 overs. A `seq` above it is rejected.

### Response `200`

```json
{
  "success": true,
  "data": {
    "accepted": 1,
    "duplicates": 0,
    "legalBalls": 14,
    "totalRuns": 27,
    "wicketsLost": 1,
    "needed": { "runs": 12, "balls": 16 },
    "abandonsAt": "2026-11-28T10:18:03.000Z"
  },
  "error": null,
  "meta": {}
}
```

| Field | Meaning |
|-------|---------|
| `accepted` | Balls newly stored. |
| `duplicates` | Balls already stored with the same `seq`, ignored safely. |
| `legalBalls`, `totalRuns`, `wicketsLost` | What the server now has for this innings, from the highest `seq` received. |
| `needed` | Only when chasing: runs and balls still needed to win. `null` when batting first. You may show it in the HUD. |
| `abandonsAt` | The ball also counts as a heartbeat. The innings is abandoned at this time if nothing else arrives. |

### Errors

| Status | `error.code` | When | What to do |
|--------|--------------|------|------------|
| `409` | `INNINGS_NOT_STARTED` | `/start` was not called for this match. | Call `/start` first. |
| `409` | `INNINGS_ABANDONED` | No ball or heartbeat for 3 minutes; the innings was counted as 0. | Stop sending; show the result. |
| `409` | `CONFLICT` | The innings is already recorded through `/scores`. | Stop sending balls for this match. |
| `400` | `VALIDATION_ERROR` | A field is missing or out of range, or `seq` is beyond the balls per innings. | Fix the data. Do not retry the same body. |
| `403` / `404` | | Not this player's match / match not found. | Stop sending. |
| `429` | | Too many requests. | Wait and resend (section 5). |

---

## 4. Rules

1. **One call per ball**, as soon as it is decided. Live updates on the website should be at most a second or two behind the game.
2. **`seq` counts balls in this innings**, starting at 1 and going up by 1. Every ball counts.
3. **Totals are after the ball.** `totalRuns` must equal the previous ball's `totalRuns` + `runs`.
4. **Balls replace heartbeats.** While balls arrive at least every 30 seconds you do not need `/heartbeat`. If the batter is idle (menu, pause, replay) for 30 seconds, send `/heartbeat` as before.
5. **`/scores` stays the official result.** Send it exactly as today when the innings ends. `score` must equal the last `totalRuns` you sent. If they differ, the `/scores` value wins and the mismatch is logged for review.
6. **Sending balls is optional per innings.** If a build or a player cannot send them, the website falls back to "batting now" and the final score. Nothing breaks.

---

## 5. Dropped connections and retries

The headset will sometimes lose its connection mid-innings. **Never lose a ball:**

1. Keep every ball of the current innings in a local queue until a `200` response includes it.
2. When a call fails (timeout, no network, `5xx`, `429`), keep the queue and retry with back-off: 1 s, 2 s, 4 s, then every 5 s.
3. On the next successful call, send **all unconfirmed balls in one request**, oldest first. Balls already stored come back as `duplicates`. This is expected and harmless.
4. Clear the queue when the innings is recorded through `/scores`, or on `409`.
5. Keep retrying for at most 3 minutes. After that the innings is abandoned by the server anyway.

Resending the same ball is always safe: the server stores each `seq` once.

---

## 6. Examples

**Batting first, a SIX on the fourth ball:**

```json
POST /matches/5b1f…/balls
{ "userId": "8a3e…", "balls": [ { "seq": 4, "runs": 6, "totalRuns": 11, "wicketsLost": 0 } ] }
```

**Out on the ninth ball:**

```json
{ "userId": "8a3e…", "balls": [ { "seq": 9, "runs": 0, "wicket": true, "totalRuns": 15, "wicketsLost": 1 } ] }
```

**Catching up after the connection dropped for balls 10 to 12:**

```json
{ "userId": "8a3e…", "balls": [
  { "seq": 10, "runs": 1, "totalRuns": 16, "wicketsLost": 1 },
  { "seq": 11, "runs": 4, "totalRuns": 20, "wicketsLost": 1 },
  { "seq": 12, "runs": 0, "totalRuns": 20, "wicketsLost": 1 }
] }
```

**Chasing 40, response after ball 18:**

```json
"data": { "accepted": 1, "duplicates": 0, "legalBalls": 18, "totalRuns": 31, "wicketsLost": 0,
          "needed": { "runs": 9, "balls": 12 }, "abandonsAt": "…" }
```

---

## 7. Test checklist

- [ ] Ball 1 is sent right after the first delivery; the website live page updates within 2 seconds.
- [ ] A FOUR sends `runs: 4` and a SIX sends `runs: 6`.
- [ ] A wicket sends `wicket: true` and the new `wicketsLost`.
- [ ] Turning Wi-Fi off for three balls and back on sends all three in one request; none are lost.
- [ ] The final `/scores` value equals the last `totalRuns`.
- [ ] Idle for over 30 seconds mid-innings still sends `/heartbeat`.
- [ ] No balls are sent after `/scores`, or after a `409`.
- [ ] A 1-over match never sends `seq` above 6.

---

## 8. Questions

**Do we still need `/heartbeat`?** Only when no ball has been sent for 30 seconds.

**What if we send a ball late?** Send it anyway with its real `seq`. It slots into place on the website.

**Can we send several balls at once on purpose?** Yes, but one call per ball gives fans the live feel. Batch only to catch up.

**Does this change scoring or who wins?** No. Results still come from `/scores`. Balls are for live display and statistics.
