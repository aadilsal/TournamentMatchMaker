# VR Cricket League — Tournament Platform

Cloud-native VR cricket tournament platform: registration, venue booking, automatic matchmaking, round-based competition with buybacks and knockout brackets, Meta Quest score submission, and a full admin panel.

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, TanStack Query, Tailwind CSS 4, Socket.IO client, Stripe Elements |
| **Backend** | Node.js 20+, Express (modular monolith), TypeScript, Socket.IO |
| **Worker** | BullMQ — matchmaking pairing, round closure, email notifications |
| **Database** | PostgreSQL 16 + PostGIS |
| **Cache / Queue** | Redis 7 |
| **Payments** | Stripe (buyback lives only) |
| **Email** | AWS SES (worker); console log fallback in dev |
| **VR integration** | Meta Quest server-to-server API |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

```bash
pnpm install

docker compose up -d postgres redis

cp .env.example .env
# Edit .env — at minimum set JWT secrets (32+ chars)

pnpm migrate:up   # auto-baselines an existing schema, then applies pending migrations
pnpm seed

pnpm dev          # API :3000, Web :5173, Worker (shared package rebuilds on change)
```

Open **http://localhost:5173** for the web app and **http://localhost:3000/health** for API health.

### Test Accounts (after `pnpm seed`)

Password for all accounts: **`password123`**

| Email | Role | Best for testing |
|---|---|---|
| `admin@vrtournament.com` | superadmin | Admin panel, all CRUD |
| `player@vrtournament.com` | player (non-VR, Lahore) | Bookings, matches, notifications |
| `player2@vrtournament.com` | player (VR, Lahore) | "Find my match" enter flow |
| `player3@vrtournament.com` | player (non-VR, Karachi) | Karachi Open tournament |
| `player4@vrtournament.com` | player (fresh) | First-time registration / enter |
| `player5@vrtournament.com` | player (VR, Karachi) | Queue / "Finding opponent…" state |
| `imam_lefty` (username) | player | Buyback flow on `/matches` |

Run `pnpm seed` to print a full feature checklist and tournament IDs.

## Documentation

| Doc | Audience |
|---|---|
| [User Guide](docs/USER_GUIDE.md) | First-time players — site navigation and full tournament flow |
| [Meta Integration API](docs/META_INTEGRATION_API.md) | Meta Quest app developers |
| [apps/api/README.md](apps/api/README.md) | API server |
| [apps/web/README.md](apps/web/README.md) | React SPA |
| [apps/worker/README.md](apps/worker/README.md) | Background jobs |
| [packages/db/README.md](packages/db/README.md) | Migrations & seeds |
| [packages/shared/README.md](packages/shared/README.md) | Shared types & domain logic |

## Player Journey (summary)

1. **Register** at `/register` — set city, VR headset status, skill profile.
2. **Browse tournaments** at `/tournaments` — open, in-progress, and completed events.
3. **Enter a tournament** via `/play?tournament=:id`:
   - **VR players:** one-click "Find my match" — auto-enqueued, no venue booking.
   - **Non-VR players:** pick a nearby venue → date → time slot within the active round window → confirm booking.
4. **Get matched** automatically — the worker pairs players by skill tier and city preference.
5. **Confirm the match** on `/matches` when notified (bell icon + real-time updates).
6. **Play in VR** — scores are submitted from the Meta Quest app (not the website).
7. **Advance or buy back** — winners move up; eliminated players can buy a life back (Stripe) during normal rounds before knockout.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the complete walkthrough.

## Web Routes

### Public / player

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/login`, `/register` | Authentication |
| `/welcome` | Post-registration onboarding |
| `/tournaments` | Tournament hub |
| `/tournaments/:id` | Detail, bracket, join/withdraw, buyback |
| `/play?tournament=:id` | Enter flow (venue + slot or VR quick-enter) |
| `/venues`, `/venues/:id` | Browse and book venue slots |
| `/bookings` | Your confirmed bookings |
| `/matches` | Active matches — confirm, decline, buyback prompts |
| `/profile` | Private profile, avatar, rating tier |
| `/players/:username` | Public player profile |

### Admin (`/admin/*`)

Dashboard, users, venues, bookings, tournaments (full lifecycle), matches, buybacks, queue monitor, notifications, integrations status, system health. Requires `venue_admin`, `tournament_admin`, or `superadmin` role.

## API Overview

All versioned routes mount under `/api/v1`. Additional: `GET /health`, `POST /webhooks/stripe`.

| Area | Key endpoints |
|---|---|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| **Players** | `GET /players/me`, `PATCH /players/me`, `GET /players/:username` |
| **Geo** | `GET /geo/location`, `GET /geo/reverse`, `GET /geo/countries`, `GET /geo/cities` |
| **Venues & slots** | `GET /venues`, `GET /venues/:id/slots?date=`, `POST /bookings` |
| **Tournaments** | `GET /tournaments`, `POST /tournaments/:id/enter`, `POST /tournaments/:id/buyback/checkout`, `GET /tournaments/:id/bracket` |
| **Matchmaking** | `GET /matchmaking/status` (automatic — no manual queue UI for players) |
| **Matches** | `GET /matches/me`, `POST /matches/:id/confirm`, `POST /matches/:id/decline` |
| **Notifications** | `GET /notifications`, `PATCH /notifications/:id/read` |
| **Meta** | `GET /integrations/meta/matches/current`, `POST /integrations/meta/matches/:id/scores` |
| **Admin** | `/admin/*` — full CRUD for all resources |

Full route listing: [apps/api/README.md](apps/api/README.md).

## Socket.IO Events

| Event | Direction | Purpose |
|---|---|---|
| `queue:joined` | S→C | Queue entry confirmed |
| `queue:position` | S→C | Position update |
| `queue:updated` | S→C | Queue state changed |
| `match:found` | S→C | Match paired |
| `match:updated` | S→C | Match status changed |
| `match:confirmed` | C→S | Player confirms |
| `match:declined` | C→S | Player declines |
| `notification:new` | S→C | New notification |
| `slot:updated` | S→C | Slot availability changed |
| `booking:updated` | S→C | Booking status changed |

## Tournament Format

All tournaments follow a unified flow (see `packages/shared/src/tournament-flow.ts`):

1. **Normal rounds** — players queue and get matched by skill tier within a round deadline.
2. **Advancement** — when a round closes, top performers advance.
3. **Buybacks** — eliminated players can re-enter (Stripe) during normal rounds while >50% of the original field remains.
4. **Knockout** — when active players drop to ≤50% of the starting field, a bracket begins (RO16 → QF → SF → Final).
5. **Venue slots** — non-VR bookings must fall within the active round window.

## Project Structure

```
apps/
  api/      Express API + Socket.IO + Stripe webhook
  web/      React SPA (player + admin)
  worker/   BullMQ matchmaking + notifications
packages/
  db/       SQL migrations & dev seed
  shared/   Zod schemas, types, domain logic (pairing, ratings, rounds)
docs/
  USER_GUIDE.md
  META_INTEGRATION_API.md
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | API + Web + Worker + shared watch |
| `pnpm dev:docker` | Start Postgres + Redis only |
| `pnpm migrate:up` | Run DB migrations |
| `pnpm migrate:down` | Roll back last migration |
| `pnpm seed` | Seed dev data |
| `pnpm test` | Run all package tests |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm qa:brutal` | End-to-end QA script |

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis (cache, queue, Socket bridge) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Auth (min 32 chars) |
| `VITE_API_URL` | Frontend → API base URL |
| `META_API_KEY` | Meta Quest integration |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `VITE_STRIPE_PUBLISHABLE_KEY` | Buyback payments (webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SES_FROM_EMAIL` | Worker email (SES) |
| `NOTIFICATION_EMAIL_ENABLED` | Toggle email dispatch |

See `.env.example` for the full list.

## Email Notifications

The worker sends transactional email via **AWS SES**. With sample AWS keys in `.env`, emails are logged to the worker console instead of being sent. In-app notifications always work via Socket.IO and the bell icon.
