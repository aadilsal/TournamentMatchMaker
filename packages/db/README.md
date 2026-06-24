# @vr-tournament/db

PostgreSQL migrations and development seed data.

## Commands

```bash
# From repo root
pnpm migrate:up        # Apply pending migrations
pnpm migrate:down      # Roll back last migration
pnpm migrate:baseline  # Baseline existing schema
pnpm db:repair         # Repair migration state
pnpm db:reset          # Drop and recreate database
pnpm seed              # Seed development data
```

## Migrations

SQL migrations in `migrations/` run in chronological order. Key tables:

| Table | Purpose |
|---|---|
| `users` | Auth, profile, skill tier, rating, VR headset, location |
| `refresh_tokens` | JWT refresh token hashes |
| `venues` | PostGIS location, capacity |
| `time_slots` | Per-venue slots (available/full/locked) |
| `bookings` | User ↔ slot reservations |
| `tournaments` | Events with rounds, phases, buyback pricing |
| `tournament_registrations` | Player ↔ tournament (optional booking link) |
| `tournament_rounds` | Round windows (starts_at / ends_at) |
| `tournament_participants` | Standings, buyback count, solo target |
| `matches` | Pairings, results, bracket slots, rematch links |
| `buybacks` | Life purchases (Stripe payment intent) |
| `notifications` | In-app + email tracking |
| `audit_logs` | Admin action audit trail |
| `venue_admins` / `tournament_admins` | Scoped admin assignments |

Extensions: PostGIS, `uuid-ossp`.

## Dev Seed (`seeds/dev.ts`)

Seeds a complete development environment:

- **25 players** with varied VR/city/tier profiles
- **6 venues** across Lahore, Karachi, Islamabad (7 days of slots)
- **5 tournaments** — open, in-progress, knockout, completed
- Match states across all statuses (pending, confirmed, in-progress, completed, cancelled)
- Buyback demo (`imam_lefty`), queue state (`player5`), notifications

Password for all accounts: **`password123`**

After seeding, a feature checklist is printed to the console with test flows and tournament IDs.

## Environment

Requires `DATABASE_URL` in root `.env`:

```
DATABASE_URL=postgresql://vrtournament:vrtournament@localhost:15432/vrtournament
```

Redis (`REDIS_URL`) is optional for seed — queue seeding is skipped if not set.
