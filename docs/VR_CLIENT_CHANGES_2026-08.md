# Meta Quest client — what changed, August 2026

**Audience:** Meta Quest / VR game integration team
**Companion doc:** `META_INTEGRATION_API.md` (v2.3) — updated alongside this, and
authoritative for the full contract.

Five server-side changes went in. **One is breaking for the headset**, one needs
a small new state on screen, and the rest need nothing from you.

---

## TL;DR — what you actually have to do

| # | Change | VR work |
|---|--------|---------|
| 1 | Absent scores are now `-1`, not `0` | **Required** — one constant |
| 2 | New "wait your turn" state | **Small** — one screen, no new endpoint |
| 3 | `chaseTarget` is now opponent + 1 | **None** — but stop adding your own +1 if you do |
| 4 | A player bats once per match; ties still rematch | **Small** — show the result before the rematch |
| 5 | Bot opponents for odd player counts | **None** — reads as a normal opponent |

Nothing about authentication, endpoints, URLs, or the response envelope has
changed. No new endpoint was added and none was removed.

---

## 1. Absent scores are `-1`, not `0` — **breaking**

`GET /matches/current` → `match.chaseTarget`, `match.myScore`,
`match.opponentScore`.

These three have always been "never null, parse as integer". That has not
changed. What changed is the value that means *no innings yet*:

```diff
- "myScore": 0,          // has not batted — or scored nothing, indistinguishable
+ "myScore": -1,         // has not batted. A genuine duck is 0.
```

**Why:** `0` was doing two jobs. A player bowled out for nothing and a player who
had not batted produced identical JSON, and the only way to tell them apart was
to cross-read `amChasing` / `amSettingTarget`. Anything that got that wrong
displayed a real duck as "not started", or an unplayed innings as a score of
zero. There was also a related hack — a genuine target of `0` was shipped as `1`
so it would not look absent — which is now gone.

**What you must do:** treat any negative value as "no innings yet". A single
guard covers all three fields:

```csharp
const int NO_SCORE = -1;

bool HasValue(int v) => v >= 0;

// Display
string myScoreText = HasValue(m.myScore) ? m.myScore.ToString() : "—";
```

**If you do nothing:** the headset will render `-1` to players — as a score, as a
target, or both.

**Guaranteed ranges after this change:**

| Field | Absent | Present |
|---|---|---|
| `chaseTarget` | `-1` | `≥ 1` (opponent's score + 1, so a duck gives `1`) |
| `myScore` | `-1` | `≥ 0` |
| `opponentScore` | `-1` | `≥ 0` |

---

## 2. Only one player bats at a time — new wait state

**Why:** both players in a match share a play window, so both could enter at
once. Neither had a target, both batted blind, and the second submission was
compared against a number that player was never shown. That is not a chase — it
is two solo innings compared after the fact.

Now the server hands the match to one player at a time. Whoever polls first bats
and sets the target; the other is told to wait, and is released to chase a real
number the moment the first score lands.

### What this looks like on the wire

A new boolean on the match object, and a new value on the existing
`soloTargetState`:

```json
{
  "soloTargetState": "waiting_for_opponent",
  "match": {
    "chaseTarget": -1,
    "amChasing": false,
    "amSettingTarget": false,
    "myScore": -1,
    "opponentScore": -1,
    "waitingForOpponent": true
  }
}
```

Read **either** `match.waitingForOpponent` or
`soloTargetState == "waiting_for_opponent"` — they always agree. Use whichever
fits your existing branch.

### The state table, updated

| `amChasing` | `amSettingTarget` | `waitingForOpponent` | Show |
|---|---|---|---|
| `true` | `false` | `false` | **Chase** — reach `chaseTarget`, submit one score |
| `false` | `true` | `false` | **Bat first** — your score sets the target |
| `false` | `false` | `true` | **Wait** — submit nothing, keep polling |

No two flags are ever true together, and one of the three is always true while
`match != null`.

### Two things to get right

- **Wait is not a dead end.** Keep polling at your normal 2–5s. It flips to
  **Chase** with a real target as soon as the other player submits. If they walk
  away without submitting, their hold lapses after **10 minutes** and you are
  promoted to **Bat first** instead — rare, but it does happen, so do not treat
  Wait as terminal.
- **A player already done batting also shows Wait.** After a player submits,
  they see `waitingForOpponent: true` with their score in `myScore` until the
  match resolves. Same screen, so there is nothing extra to build — just do not
  offer a score-entry UI while `waitingForOpponent` is true. It will `409`.

**If you do nothing:** a waiting player falls into all-flags-false, which the
previous contract said could not happen. Depending on your branch that is either
a stuck screen or a bogus "defend" state. This is the one new case worth
building.

---

## 3. `chaseTarget` is the opponent's score **+ 1**

`chaseTarget` is now the runs needed to **win**, not the runs the opponent made.

```
opponent scored 87  →  chaseTarget: 88
opponent scored 0   →  chaseTarget: 1
```

**Why:** "reach the target" and "win the match" now mean the same thing.
Previously `chaseTarget` was the raw opponent score, so a chaser who *reached* it
had only levelled — and levelling does not win.

**What you must do:** display `chaseTarget` exactly as sent. If your UI computes
"runs needed" from `opponentScore` itself, drop that and use `chaseTarget`. If
you already add `+1` anywhere, remove it — the server applies it now, and
applying it twice asks for one run too many.

Resolution is unchanged and still server-side. A chaser who reaches
`chaseTarget` wins; below it, they lose.

---

## 4. One innings per match — and when a rematch appears

**A player bats once per match.** Once their score is in — or, for a
target-setter, once their solo target is carried into the match at pairing —
they are finished. Every later submission from them returns `409`.

**Why:** this was a real defect, not a tightening. A player could bat, wait for
their opponent to chase, then re-enter the *same* match and bat again, now
knowing the score to beat. It is fixed at the database level rather than by a
check that could be missed.

**Ties still produce a rematch** — as a *new* match, never a second innings in the
old one. Both players are re-queued and paired again, each with a clean innings.
`result.outcome == "rematch"`, `status: cancelled`, `winnerId: null`. Keep any
handling you already have for this.

### The ordering that matters

**A rematch is only declared once both innings are in.** When the first player
submits, nothing is decided — the response is `status: in_progress`, the server
is still waiting on the opponent, and there is no tie, winner or rematch yet.

> **Do not show a result or a rematch prompt after the first submission.** Show
> the wait state from §2. The decision only exists once the second innings lands.

### Showing the result first

The player who bats **first** never learns the outcome from their own submission —
it returned while the match was still open. They find out on their next poll,
through a new **`lastResult`** object on `GET /matches/current`:

```json
{
  "match": null,
  "lastResult": {
    "matchId": "1a911c21-…",
    "opponent": "player5_queued",
    "myScore": 14,
    "opponentScore": 14,
    "outcome": "tie",
    "rematchQueued": true,
    "decidedAt": "2026-08-20T14:32:10.000Z"
  }
}
```

`outcome` is `"win"`, `"loss"` or `"tie"`. It persists for **5 minutes** after the
match is decided, so a headset taken off and put back on still catches it, and it
is `null` while any match is in play — it can never announce a result for a match
that is still being played.

**Recommended sequence on a tie:** show the final scoreline first, *then* surface
the rematch. The player is already back in the queue; the next poll with
`match != null` is the new match.

`lastResult` is **additive** — ignore it and you behave exactly as before, except
the first-batting player never sees how their match ended.

### New `409` messages

All already covered if you show `error.message` on conflict:

- `You have already played your innings in this match`
- `Your solo target is already recorded as your score for this match — only the chaser submits`
- `Your opponent is playing this match right now — wait for their score, then chase it`

---

## 5. Bot opponents — no VR change

When a tournament round has an odd number of players, the player left without an
opponent is now matched with a bot instead of sitting out.

**This is invisible to the headset by design.** The bot has an ordinary username,
appears in `match.opponent` like anyone else, bats a believable six-ball innings,
and can win — and if it wins, it advances to the next round exactly like a human
would. Every field you already read behaves normally.

Notes, for context rather than action:

- It is a **last resort**. Real opponents are always preferred; the fallback only
  fires in the final **15 minutes** of a round, after the player has waited at
  least 5, so almost the whole round is spent trying to find them a human.
- Its innings is generated as six weighted deliveries, so totals land in the
  10–20 range with real spread — sometimes easily chased, sometimes not.
- Admins can always identify bots in the admin panel. Players cannot, and that is
  intentional.

---

## Testing checklist

Worth running on your side once the `-1` and wait-state changes are in:

| # | Scenario | Expected |
|---|---|---|
| 1 | Poll a fresh match as the first player to arrive | `amSettingTarget: true`, `chaseTarget: -1`, all scores `-1` |
| 2 | Poll the same match as the second player | `waitingForOpponent: true`, nothing submittable |
| 3 | First player submits, second player polls | `amChasing: true`, `chaseTarget` = first score + 1 |
| 4 | Second player submits and polls again | `match: null`, `lastResult` carries the outcome |
| 5 | Any player submits twice | `409`, no score change |
| 6 | Submit while `waitingForOpponent: true` | `409` |
| 7 | Opponent bowled out for a duck | `chaseTarget: 1`, `opponentScore: 0` — **not** `-1` |
| 8 | Chaser levels the opponent's score | `cancelled`, `outcome: rematch`, both re-queued, `lastResult.outcome: "tie"` |
| 9 | Player who already batted polls | `waitingForOpponent: true`, `myScore` = their score |
| 10 | **First** player submits, then polls | `lastResult: null` — nothing decided yet, **no rematch prompt** |
| 11 | First player polls after the second submits | `lastResult` carries the outcome, tie included |

Scenarios 7 and 8 catch a client still assuming the old contract. Scenario 10 is
the one to watch for the rematch flow — nothing is decided after the first
submission, so a result or rematch prompt appearing there is a bug.

---

## Questions

Anything ambiguous here, or a case the state table does not cover — send it over
and we will pin the behaviour down before you build against it.
