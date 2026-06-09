# VR Tournament Platform

Cloud-native tournament registration, matchmaking, and venue booking platform (Phases 1–4).

## Stack

- **Frontend:** React 19, Vite, TanStack Query, Tailwind CSS, Socket.IO client
- **Backend:** Node.js, Express (modular monolith), TypeScript, Socket.IO
- **Worker:** BullMQ (matchmaking pairing + email notifications)
- **Database:** PostgreSQL 16 + PostGIS
- **Cache/Queue:** Redis 7

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

pnpm migrate:up   # auto-baselines an existing schema, then applies pending migrations only
pnpm seed

pnpm dev   # API :3000, Web :5173, Worker
```

### Test Accounts (after seed)

| Email | Password | Role | Notes |
|---|---|---|---|
| admin@vrtournament.com | password123 | superadmin | |
| player@vrtournament.com | password123 | player | No VR, Lahore |
| player2@vrtournament.com | password123 | player | Has VR |
| player3@vrtournament.com | password123 | player | Karachi |

## API Endpoints

### Auth & Players
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/players/me` | Get profile |

### Venues & Bookings
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/venues` | List venues (geo search) |
| POST | `/api/v1/bookings` | Book a slot |
| GET | `/api/v1/bookings/me` | My bookings |

### Tournaments (Phase 3)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/tournaments` | List tournaments |
| GET | `/api/v1/tournaments/:id` | Tournament detail |
| POST | `/api/v1/tournaments/:id/register` | Register |
| DELETE | `/api/v1/tournaments/:id/register` | Withdraw |
| GET | `/api/v1/tournaments/:id/bracket` | Bracket MVP |
| POST | `/api/v1/tournaments` | Create (admin) |

### Matchmaking (Phase 3)
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/matchmaking/queue` | Join queue |
| DELETE | `/api/v1/matchmaking/queue` | Leave queue |
| GET | `/api/v1/matchmaking/status` | Queue status |

### Matches (Phase 3)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/matches/me` | My matches |
| POST | `/api/v1/matches/:id/confirm` | Confirm match |
| POST | `/api/v1/matches/:id/decline` | Decline match |

### Notifications (Phase 4)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/notifications` | In-app notifications |
| PATCH | `/api/v1/notifications/:id/read` | Mark read |
| PATCH | `/api/v1/notifications/read-all` | Mark all read |

### Socket.IO Events (Phase 4)
| Event | Direction | Purpose |
|---|---|---|
| `queue:joined` | S→C | Queue entry confirmed |
| `queue:position` | S→C | Position update |
| `match:found` | S→C | Match paired |
| `match:confirmed` | C→S | Player confirms |
| `match:declined` | C→S | Player declines |
| `notification:new` | S→C | New notification |

## Project Structure

```
apps/
  api/      Express API + Socket.IO
  web/      React SPA
  worker/   BullMQ matchmaking + email worker
packages/
  db/       Migrations & seeds
  shared/   Zod schemas & types
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start API + Web + Worker |
| `pnpm migrate:up` | Run DB migrations |
| `pnpm seed` | Seed dev data |
| `pnpm test` | Run all tests |
| `pnpm build` | Build all packages |

## Email Notifications

Uses [Resend](https://resend.com) for transactional email. Set `RESEND_API_KEY` in `.env`. Without it, emails are logged to the worker console in development.
