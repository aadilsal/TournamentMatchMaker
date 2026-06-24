# @vr-tournament/worker

BullMQ background worker for matchmaking pairing, match/round expiry, and notification dispatch.

## Development

```bash
# From repo root (recommended)
pnpm dev

# Worker only
pnpm --filter @vr-tournament/worker dev
```

Requires Redis and PostgreSQL (same `.env` as the API).

## Queues

### `matchmaking-jobs`

| Job | Schedule | Purpose |
|---|---|---|
| `pair-repeat` | Every 2s | Poll Redis queue, pair players, lock slots, create matches |
| `pair-now` | On-demand | Immediate pairing (triggered by API/admin) |
| `expire-repeat` | Every 30s | Expire unconfirmed matches (>5 min), release slot locks |
| `expire-unplayed-repeat` | Every 60s | Expire confirmed matches past slot end with no scores |
| `close-round-repeat` | Every 1h | Close expired tournament rounds, advance/eliminate players |

### `notifications-dispatch`

| Job | Trigger | Purpose |
|---|---|---|
| `dispatch` | Event-driven | Upsert in-app notification + send email via AWS SES |

## Pairing Logic

Implemented in `@vr-tournament/shared` (`pairing.ts`), executed by the worker:

- Match players by **skill tier** with widening tolerance over wait time.
- Prefer **same-city** pairings.
- Handle **solo chase** targets (earlier solo timestamp wins chase role).
- Lock venue slots during pairing via Redlock.
- Emit `match:found` via Redis → Socket.IO bridge.

## Round Closure

When a tournament round's `ends_at` passes:

1. Close the round.
2. Rank participants by wins/losses.
3. Advance top performers to the next round.
4. Eliminate bottom performers (buyback-eligible during normal phase).
5. Start knockout bracket when active field ≤ 50% of initial count.

Logic: `packages/shared/src/round-advancement.ts`.

## Email

Transactional email via **AWS SES** (`@aws-sdk/client-ses`).

- Templates: match found, tournament registered.
- With sample AWS keys in `.env`, emails log to console instead of sending.
- Toggle with `NOTIFICATION_EMAIL_ENABLED`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Watch mode via tsx |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | TypeScript check |

## Environment

Requires `DATABASE_URL`, `REDIS_URL`, and AWS SES credentials (or sample keys for dev logging). See root `.env.example`.
