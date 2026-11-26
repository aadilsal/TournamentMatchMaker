# Meta Quest client — what changed, November 2026

**For:** the Meta Quest / Unity team · **API version:** 2.5 ·
**Full contract:** [integration-api.md](integration-api.md) (§5.1, §5.4, §5.6)

Everything here is **additive** — the current Quest app keeps working without changes. The items
below are what you need to build to give players the new experience.

## 1. Tournaments work differently now (no slots)

- Players choose a tournament and **where they play**: a venue, or **Home** on their own headset.
- At each round start everyone is **drawn one opponent**. They play any time before the round
  closes. There are no time slots and no matchmaking queue.
- One innings each; the second player chases (unchanged).
- **Tie:** the *same* match is replayed. `GET /matches/current` returns the match again with both
  scores reset, and `lastResult` set to `outcome: "tie"` with the tied scores so you can show
  "It's a tie — play again".
- **Computer opponent** (odd fields): it plays *after* the human, within a few runs of their
  score. It looks like a normal opponent.
- **Deadline:** for these matches `match.startTime` / `match.endTime` are the **round** window;
  `timeSlotId` is `null`.
- **Solo target** (`POST /solo-target`) is not used in the new format; `canSubmitSoloTarget` is
  always `false` for these players.

## 2. Personalised player card — please build

After the 4-digit code is verified, the response now includes a `player` object. The same object
comes from `GET /players/profile?userId=…&timeZone=Asia/Karachi` — call it each time the menu opens.

Show at least:

| Field | Use it for |
|---|---|
| `greeting` | The menu headline ("Welcome back, ali — your match is ready!") |
| `username`, `skillTierLabel`, `record` | Player header ("Tier 3 · 7 won · 3 lost") |
| `tournaments[].name`, `playingAt` | "Super Over Cup · Super Over Arena" or "· Home" |
| `tournaments[].statusText` | One line under each tournament ("Semi-final: play zara_vr before Sat 7:00 PM") |
| `tournaments[].match.state` | `your_turn` → highlight a **Play** button; `waiting_for_opponent` → show the score and "waiting" |

Pass the headset's time zone in `timeZone` so times in `statusText` are local.

## 3. Players in more than one tournament — please build

A player can now be in several tournaments with an open match in each.

- `GET /matches/current` returns the match with the **soonest deadline** as `match`, now labelled
  with `match.tournamentName` and `match.roundLabel` — show both in the match HUD and on the result
  screen.
- `matches[]` lists **every** open match (tournament, round, opponent, `your_turn` /
  `waiting_for_opponent`, deadline).
- When `matches` has more than one entry, show a **Choose your match** screen. After the player
  picks, call `GET /matches/current?userId=…&tournamentId=…` and play that match as usual.
- Scores are always submitted to a **match id**, so a score can never land in the wrong
  tournament.

## 4. Test checklist

1. Link a headset with a fresh code → `player` is present and the greeting shows the username.
2. Player in one tournament → no picker; HUD shows tournament name and round.
3. Player in two tournaments → picker lists both; each plays and submits independently.
4. Tie (submit equal scores from both players) → same match comes back with `lastResult.outcome = "tie"`.
5. Odd field → computer opponent; the human bats first and the result arrives on the next poll.

Ask the PixelPaddle team for a test tournament on staging to run these.
