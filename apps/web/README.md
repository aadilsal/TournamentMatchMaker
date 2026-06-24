# @vr-tournament/web

React 19 single-page application for players and administrators.

## Development

```bash
# From repo root (recommended)
pnpm dev

# Web only
pnpm --filter @vr-tournament/web dev
```

Runs on **http://localhost:5173**. API URL is set via `VITE_API_URL` in `.env`.

## Layouts

| Layout | Used for |
|---|---|
| `MarketingLayout` | Landing page (`/`) |
| `AppLayout` | Player pages — header nav, notifications, Socket sync |
| `AdminLayout` | Admin panel (`/admin/*`) — sidebar, scoped by role |

## Player Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `LandingPage` | Marketing site |
| `/login` | `LoginPage` | Authentication |
| `/register` | `RegisterPage` | Account creation |
| `/welcome` | `WelcomePage` | Post-registration onboarding |
| `/tournaments` | `TournamentsPage` | Tournament hub |
| `/tournaments/:id` | `TournamentDetailPage` | Detail, bracket, join/withdraw, buyback |
| `/play` | `PlayFlowPage` | Enter flow — venue/slot (non-VR) or quick-enter (VR) |
| `/venues` | `VenuesPage` | Geo-sorted venue list |
| `/venues/:id` | `VenueDetailPage` | Venue info + slot booking |
| `/bookings` | `BookingsPage` | User bookings |
| `/matches` | `MatchesPage` | Match list — confirm/decline, buyback prompts |
| `/profile` | `ProfilePage` | Private profile + avatar |
| `/players/:username` | `PublicProfilePage` | Public stats and match history |

## Admin Pages

All routes under `/admin/*`, guarded by `AdminGuard`:

- Dashboard, users, venues, bookings
- Tournaments (create, edit, lifecycle controls, bracket)
- Matches, buybacks, queue monitor
- Notifications, integrations status, system health

## Key Components

| Area | Components |
|---|---|
| Tournament | `KnockoutBracket`, `NormalMatchList`, `BuybackButton`, `SlotConfirmModal` |
| Slots | `SlotPicker` — date/slot selection with round-window filtering |
| Notifications | `NotificationBell` — real-time via Socket.IO |
| Sync | `SocketSyncProvider` — invalidates TanStack Query on socket events |
| Landing | Hero, features, how-it-works sections |

## State & Data

- **TanStack Query** for server state (caching, polling on live matches).
- **Socket.IO client** (`useSocket`) for real-time updates.
- **JWT** stored in memory; refresh via HTTP-only cookie.
- **Stripe Elements** (`BuybackButton`) for buyback payments.

## Environment

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL (e.g. `http://localhost:3000`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for buybacks |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | TypeScript check |

## User Documentation

First-time player guide: [docs/USER_GUIDE.md](../../docs/USER_GUIDE.md)
