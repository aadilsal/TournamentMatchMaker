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

### Demo: everything in Docker

```bash
docker compose up -d --build   # postgres, redis, seed (migrate + demo data), api, worker, web
```

Open **http://localhost:5173**. The `seed` step resets demo data on every `up`. Port 5173 must be free on the host, and if 15432 is taken run `POSTGRES_HOST_PORT=25432 docker compose up -d --build`. Stop with `docker compose down` (add `-v` to wipe the database).

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
| [Documentation index](docs/README.md) | Everything below, plus QA reports and audits |
| [Player Guide](docs/guides/player-guide.md) | Players — joining, playing, buybacks, headset |
| [Admin Guide](docs/guides/admin-guide.md) | Admins, venue partners and support staff |
| [Flow diagrams](docs/flows/README.md) | Everyone — how the app works, as pictures |
| [Deployment](docs/operations/deployment.md) | Engineers deploying to production |
| [Meta Integration API](docs/integrations/meta/integration-api.md) | Meta Quest app developers |
| [apps/api/README.md](apps/api/README.md) | API server |
| [apps/web/README.md](apps/web/README.md) | React SPA |
| [apps/worker/README.md](apps/worker/README.md) | Background jobs |
| [packages/db/README.md](packages/db/README.md) | Migrations & seeds |
| [packages/shared/README.md](packages/shared/README.md) | Shared types & domain logic |

## Player Journey (summary)

1. **Register or log in** — the app sends you to the right step automatically.
2. **Choose a tournament** — only tournaments still taking players are listed.
3. **Choose where you play** — a venue, or **Home** if you have a VR headset.
4. **My tournaments** — one card per tournament says what to do next; link your headset with the 4-digit code.
5. **Play** — each round you get one opponent; play your innings any time before the round closes.
6. **Win to go through** — the last player standing is champion. Lost in round 1? Buy back in.

See [docs/guides/player-guide.md](docs/guides/player-guide.md) for the full walkthrough.

## Web Routes

### Public / player

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/login`, `/register` | Authentication |
| `/start` | Sends a player to the right step of the guided flow |
| `/join` | ① Choose a tournament |
| `/join/:tournamentId` | ② Where you play (a venue, or Home for headset owners) |
| `/my-tournaments` | ③ My tournaments — one card per tournament, headset code |
| `/tournaments`, `/tournaments/:id` | Browse tournaments; rounds and results |
| `/play`, `/venues`, `/bookings`, `/matches`, `/welcome` | Old pages — redirect into the guided flow |
| `/profile` | Private profile, avatar, rating tier |
| `/players/:username` | Public player profile |

### Admin (`/admin/*`)

Dashboard (incl. where players are playing), users, venues (incl. players at each venue), tournaments (create, publish, start now, close round now), matches, buybacks, notifications, integrations status, system health. Requires `venue_admin`, `tournament_admin`, or `superadmin` role.

## API Overview

All versioned routes mount under `/api/v1`. Additional: `GET /health`, `POST /webhooks/stripe`.

| Area | Key endpoints |
|---|---|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| **Players** | `GET /players/me`, `PATCH /players/me`, `GET /players/me/journey`, `GET /players/me/tournaments`, `GET /players/:username` |
| **Geo** | `GET /geo/location`, `GET /geo/reverse`, `GET /geo/countries`, `GET /geo/cities` |
| **Venues & slots** | `GET /venues`, `GET /venues/:id/slots?date=`, `POST /bookings` |
| **Tournaments** | `GET /tournaments`, `POST`/`DELETE /tournaments/:id/join`, `POST /tournaments/:id/buyback/checkout`, `GET /tournaments/:id/rounds`, `GET /tournaments/:id/matches` |
| **Matchmaking** | `GET /matchmaking/status` (automatic — no manual queue UI for players) |
| **Matches** | `GET /matches/me`, `POST /matches/:id/confirm`, `POST /matches/:id/decline` |
| **Notifications** | `GET /notifications`, `PATCH /notifications/:id/read` |
| **Meta** | `POST /integrations/meta/identity/verify-link-code`, `GET /integrations/meta/players/profile`, `GET /integrations/meta/matches/current`, `POST /integrations/meta/matches/:id/scores`, `GET /integrations/meta/tournaments/live` |
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

New tournaments use the **draw format** (see [docs/flows/match-and-round.md](docs/flows/match-and-round.md)):

1. **Draft → Open → Live → Finished.** Registration closes at the start time; round 1 is drawn automatically.
2. **Every round is a knockout draw** — re-seeded by rating, top vs bottom; an odd field gives the lowest seed a computer opponent.
3. **Play any time inside the round.** One innings each; the second player chases. Ties are replayed.
4. **Rounds close at their deadline** (or early once every match is decided); unplayed matches are settled and the next round is drawn.
5. **Buybacks** only in round 1, never in a final.

Tournaments created before November 2026 keep the classic format (slots, bookings, queue) until they finish.

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
  guides/        player guide, operations manual
  flows/         flow diagrams
  integrations/  Meta Quest API and client notes
  operations/    deployment
  plans/         design and implementation plans
  qa/            dated QA reports
  audits/        UX and readiness audits
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
