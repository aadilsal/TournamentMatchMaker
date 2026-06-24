# @vr-tournament/shared

Shared TypeScript types, Zod validation schemas, and domain logic used by API, web, and worker.

## Build

The shared package must be built before other packages can import it:

```bash
pnpm --filter @vr-tournament/shared build
# Root `pnpm dev` handles this automatically with --watch
```

## Exports

### Zod Schemas (`src/schemas/`)

Validation for API requests and admin forms:

`auth`, `player`, `venue`, `slot`, `booking`, `tournament`, `matchmaking`, `match`, `notification`, `buyback`, `meta`, `stripe`, `admin`, `admin-forms`

### Types (`src/types.ts`)

Core TypeScript interfaces: `User`, `Venue`, `Tournament`, `Match`, `Buyback`, `Notification`, `AdminDashboardStats`, and more.

### Domain Logic

| Module | Purpose |
|---|---|
| `pairing.ts` | Player pairing — tier tolerance, same-city preference, wait-time widening |
| `match-resolution.ts` | Chase/rematch score resolution, winner determination |
| `round-advancement.ts` | Knockout threshold (50% field), round numbers (RO16=100 … Final=103) |
| `round-duration.ts` | Round duration units and validation |
| `rating.ts` | ELO-like points (+30 win, −18 loss), tier thresholds |
| `locations.ts` | Pakistan city coordinates, haversine distance, city snap |
| `slot-utils.ts` | Slot window checks (`isSlotWithinWindow`, expiry) |
| `tournament-flow.ts` | `TOURNAMENT_FLOW_GUIDE` — documented tournament lifecycle |
| `matchmaking-queue.ts` | Redis key helpers for queue state |
| `queue-names.ts` | BullMQ queue and job name constants |
| `socket-events.ts` | Typed Socket.IO event payloads (server ↔ client) |

## Usage

```typescript
import {
  type Tournament,
  type Match,
  isSlotWithinWindow,
  findBestPair,
  pointsToTier,
  TOURNAMENT_FLOW_GUIDE,
} from '@vr-tournament/shared';
```

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Compile to `dist/` |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit tests |
