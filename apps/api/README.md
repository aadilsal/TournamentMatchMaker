# @vr-tournament/api

Express API server with Socket.IO, JWT authentication, Stripe webhooks, and Meta Quest integration.

## Development

```bash
# From repo root (recommended — starts API + web + worker)
pnpm dev

# API only
pnpm --filter @vr-tournament/api dev
```

Runs on **http://localhost:3000** (configurable via `PORT`).

## Architecture

```
src/
  index.ts              Entry point, middleware, route mounting
  modules/
    auth/               Register, login, refresh, logout
    players/            Profile, avatar, public profiles, buyback options
    venues/             Venue CRUD, geo search
    slots/              Time slot listing and admin creation
    bookings/           Slot booking and cancellation
    tournaments/        Registration, enter, buyback checkout, bracket
    matchmaking/        Queue status (join/leave are internal/auto)
    matches/            Confirm, decline, score
    notifications/      In-app notifications
    integrations/       Meta Quest API
    admin/              Full admin CRUD surface
    geo/                IP geolocation, reverse geocode, city lists
  socket/               Socket.IO server + Redis adapter
  middleware/           Auth, rate limiting, error handling
  webhooks/             Stripe payment_intent.succeeded
```

## Route Mounting

| Prefix | Module |
|---|---|
| `/api/v1/auth` | Authentication |
| `/api/v1/players` | Player profiles |
| `/api/v1/venues` | Venues |
| `/api/v1/venues/:id/slots` | Time slots |
| `/api/v1/bookings` | Bookings |
| `/api/v1/tournaments` | Tournaments |
| `/api/v1/matchmaking` | Matchmaking status |
| `/api/v1/matches` | Matches |
| `/api/v1/notifications` | Notifications |
| `/api/v1/integrations/meta` | Meta Quest (API key auth) |
| `/api/v1/admin` | Admin panel API |
| `/api/v1/geo` | Geolocation helpers |
| `/health` | Health check |
| `/webhooks/stripe` | Stripe webhook (no JWT) |

## Auth

- **Access token:** JWT in `Authorization: Bearer` header (15 min default).
- **Refresh token:** HTTP-only cookie, rotated on `/auth/refresh`.
- **Roles:** `player`, `venue_admin`, `tournament_admin`, `superadmin`.
- Admin routes enforce role + scoped access (venue/tournament assignments).

## Key Endpoints

### Tournaments

```
GET    /api/v1/tournaments
GET    /api/v1/tournaments/:id
GET    /api/v1/tournaments/:id/bracket
GET    /api/v1/tournaments/:id/registration
GET    /api/v1/tournaments/:id/participant
POST   /api/v1/tournaments/:id/register
POST   /api/v1/tournaments/:id/enter        # book + register + enqueue
DELETE /api/v1/tournaments/:id/register
POST   /api/v1/tournaments/:id/buyback/checkout
```

### Matches

```
GET    /api/v1/matches/me
GET    /api/v1/matches/:id
POST   /api/v1/matches/:id/confirm
POST   /api/v1/matches/:id/decline
POST   /api/v1/matches/:id/score          # API exists; production scores via Meta
```

### Meta Integration

```
GET    /api/v1/integrations/meta/matches/current?userId=
POST   /api/v1/integrations/meta/matches/:id/scores
POST   /api/v1/integrations/meta/solo-target
```

Auth: `x-meta-api-key` header. See [docs/META_INTEGRATION_API.md](../../docs/META_INTEGRATION_API.md).

## Socket.IO

Real-time events defined in `@vr-tournament/shared` (`socket-events.ts`). The API emits match, queue, notification, slot, and booking updates. Clients authenticate with the same JWT access token.

## Stripe

Buyback checkout creates a PaymentIntent. Fulfillment happens in the webhook handler at `POST /webhooks/stripe` on `payment_intent.succeeded`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Watch mode via tsx |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | Integration tests |
| `pnpm typecheck` | TypeScript check |

## Environment

Requires `DATABASE_URL`, `REDIS_URL`, JWT secrets, and `CORS_ORIGIN`. See root `.env.example`.
