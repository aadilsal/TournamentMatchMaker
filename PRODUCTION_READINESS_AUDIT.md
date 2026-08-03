# VR Cricket League — Production Readiness Audit

**Scope:** Full monorepo (`apps/api`, `apps/worker`, `apps/web`, `packages/db`, `packages/shared`, infra/CI) — "vr-tournament" tournament matchmaking platform (React/Express/Postgres+PostGIS/Redis/BullMQ/Stripe/Meta Quest S2S).

**Bottom line:** the architecture and a lot of the individual pieces are well-built (row-level locking on bookings, correct Stripe webhook signature verification, PostGIS done right, Redis-adapter socket scaling, idempotent close-round job). But there are **~16 critical-severity issues** — several of them exploitable access-control gaps and money-affecting race conditions — plus a disabled CI pipeline and leaked/leakable credentials. This is **not production-ready as-is**. None of it is unfixable; most fixes are small and localized, but they need to happen before launch, not after.

---

## 0. Do this today (secrets)

1. **Rotate the Meta integration API key.** The real key is hardcoded in `docker-compose.yml:47` (tracked in git since the first commit — `git log` confirms it's been in history the whole time). Anyone with repo access has it permanently, even if you edit the file now (git history retains it). Rotate the key, remove it from `docker-compose.yml`, and inject it only via a git-ignored `.env`/secrets manager. If this repo is ever made public or shared with a contractor, scrub history first (`git filter-repo`/BFG) — cheap with only ~22 commits.
2. **Rotate the live Stripe secret key and Resend API key.** Your local `.env` contains a **live** Stripe secret key (`sk_live_...`, not a test key) and a real Resend API key in plaintext. Good news: `.env` was never committed to git (verified — only `.env.example` was ever added in any commit). But any live secret that's sat unencrypted on a laptop should be treated as potentially exposed — rotate both as a precaution, and move real secrets to a proper secrets manager (1Password, AWS Secrets Manager, Doppler, etc.) rather than a local `.env` file for anything touching real money.
3. **CI is fully disabled** (`.github/workflows/ci.yml:3-9` — `if: false`, only triggers on manual `workflow_dispatch`). Nothing is currently gating merges to `main`: no tests, no lint, no typecheck. Re-enable it before anyone else touches this code.

---

## 1. Critical issues

### Access control

**1.1 — Venue/tournament admin scoping is enforced on ~4 of ~60 admin routes (broken access control / IDOR / privilege escalation)**
`apps/api/src/modules/admin/admin.routes.ts`
`assertVenueAccess`/`assertTournamentAccess` exist and work, but are only wired into 4 routes (venue get/patch, tournament get/patch) plus scoped filtering on 2 list endpoints. Every other route behind `requireAdmin()` — reachable by *any* `venue_admin` or `tournament_admin`, not just `superadmin` — has no scope check. A venue_admin for Venue A can, just by changing an ID in the URL: create/modify/delete slots at any venue, cancel/create bookings anywhere, and **add or remove other admins on venues they don't own** (privilege escalation). A tournament_admin can similarly publish/close/start/complete *any* tournament and manage its admins. `/admin/matches/*` and `/admin/buybacks/*` have **zero** scope checks anywhere, so any admin tier can force-confirm matches, overwrite results (feeding into rating calculations), and manage refunds outside their scope. Global queue/system endpoints also lack a superadmin-only gate.
**Fix:** apply the existing `guardVenueAccess()`/`guardTournamentAccess()` helpers to every route touching a venue/tournament/booking/slot/match-scoped resource; restrict queue/system endpoints to `requireSuperAdmin()`.

**1.2 — Meta integration auth is fully bypassable when `META_SSH_PUBLIC_KEY` is unset**
`apps/api/src/middleware/metaAuth.ts:7-15`, `apps/api/src/config/env.ts:21`
`META_SSH_PUBLIC_KEY` has no default (`undefined` if unset). The check does `sshPublicKey === env.META_SSH_PUBLIC_KEY`; a request sending **no header at all** also evaluates to `undefined`, so `undefined === undefined` → `true`. Short-circuit skips the API-key check entirely. **Every Meta endpoint (score submission, match state, link-code verification) is unauthenticated** whenever this optional var isn't configured — anyone can submit arbitrary scores for any match or read any player's match state.
**Fix:** treat an unset `META_SSH_PUBLIC_KEY` as "this auth path is disabled," not "any value matches."

**1.3 — Hardcoded default secrets ship in source and are used if env vars are unset**
`apps/api/src/config/env.ts:20-23` — `META_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` all use `.default('sample-...')` instead of failing closed like `JWT_ACCESS_SECRET` does. If ops forgets to set the real value in prod, the server boots fine using a value that's sitting in this repo (and in the test file). `STRIPE_WEBHOOK_SECRET` defaulting to a known value means anyone who's read the repo can forge a valid-looking webhook signature and trigger a free buyback fulfillment.
**Fix:** make these required with no default (fail at boot), matching the JWT secret pattern already used elsewhere in the same file.

**1.4 — JWT revocation (logout blacklist) isn't checked on Socket.IO connections**
`apps/api/src/socket/auth.middleware.ts:6-20`
The HTTP `authenticate()` middleware checks a Redis blacklist for revoked tokens; the socket auth middleware verifies the JWT but never checks the same blacklist. A logged-out user (or one an admin force-logged-out) keeps a live socket connection — and can still confirm/decline matches through it — until the access token's natural 15-minute expiry.
**Fix:** apply the same blacklist check in `socketAuth`, and disconnect live sockets when their `jti` is blacklisted.

### Payments (money-affecting races)

**1.5 — Buyback fulfillment can double-grant on concurrent webhook delivery**
`apps/api/src/modules/tournaments/tournaments.service.ts:465-536`
The status check happens outside a locked transaction and the completing `UPDATE` has no `WHERE status = 'pending'` guard. Stripe *does* redeliver webhooks; two near-simultaneous deliveries (or a webhook racing an admin action) can both pass the "already completed?" check before either commits — both increment the buyback count, both requeue the player, both send a confirmation notification, for one payment.
**Fix:** make the transition atomic — `UPDATE buybacks SET status='completed' WHERE id=$1 AND status='pending' RETURNING *`, no-op if zero rows affected. Apply the same pattern to `failBuybackFromWebhook`.

**1.6 — Retrying buyback checkout while a payment is `succeeded`/`processing` marks it `failed` and can double-charge**
`apps/api/src/lib/stripe.ts:57-98`
Only 3 PaymentIntent statuses are treated as "safe to reuse." Any other status — including `succeeded` (payment already captured, webhook just hasn't landed yet) — causes the existing buyback to be stamped `failed` and a **new** PaymentIntent + row created. Concrete failure: a double-click or client retry right after a successful payment marks the real, paid buyback `failed`; when its webhook eventually arrives, `fulfillBuybackFromWebhook` sees `status='failed'` and silently ignores it (`console.warn`) — player is charged, gets nothing, no alert fires. A second charge may also succeed.
**Fix:** only create a new PaymentIntent for genuinely terminal failure states; let the webhook resolve `succeeded`/`processing`, don't preemptively fail them.

**1.7 — Buyback fulfillment never re-checks tournament phase/knockout threshold at payment-completion time**
`apps/api/src/modules/tournaments/tournaments.service.ts:429-536`; confirmed independently from the matchmaking-side race in `apps/worker/src/jobs/pair-players.job.ts:314-321`
Eligibility (round still open, knockout not yet started) is checked only when checkout is *created*, never re-verified when the webhook actually fulfills it. Stripe checkout (card entry, 3DS) routinely takes longer than a round window. If the round closes and the tournament flips to knockout while payment is in flight, the webhook still reactivates the player and requeues them into the normal-round queue — producing a match/bracket inconsistent with the tournament's actual phase, with money already taken.
**Fix:** re-validate phase/round-window inside `fulfillBuyback`'s transaction; auto-refund and notify if no longer eligible instead of silently granting.

**1.8 — Score submission is a lost-update race, contradicting the documented idempotency guarantee**
`apps/api/src/modules/integrations/meta.service.ts:127-195`; independently confirmed as a matchmaking-integrity issue too (double rating/win-loss updates via `apps/api/src/lib/match-outcome.ts`)
Read-check-write on `matches.result` with no transaction, no row lock, no compare-and-swap. Two concurrent/retried score submissions (real scenario on flaky venue Wi-Fi, which headsets will retry on timeout) can both read "not yet submitted," both proceed, and both trigger rating/win-loss updates — double-counted, and can stomp one player's score with the other's stale read. This directly contradicts the documented behavior in `docs/META_INTEGRATION_API.md` that a duplicate submission returns 409 rather than double-processing.
**Fix:** `SELECT ... FOR UPDATE` in a transaction, or an atomic conditional `UPDATE ... WHERE result->>'playerXScore' IS NULL`.

### Matchmaking / tournament integrity

**1.9 — Pairing lock TTL (4s) is shorter than the work it protects, allowing the same player to be paired into two matches**
`apps/worker/src/lib/redlock.ts:3`, `apps/worker/src/jobs/pair-players.job.ts:506-538`
One lock is acquired once, then held across draining up to 50 pairs per tournament across every active tournament — multiple DB round-trips each. Under real load this exceeds 4 seconds easily. Once the key expires, the next scheduled run (every 2s) can acquire the same lock and start draining the same queue snapshot concurrently — pairing a player twice before the first run removes them from the queue.
**Fix:** extend the lock on each iteration (heartbeat) with an abort-if-exceeded watchdog, or move to a proper auto-extending distributed lock.

**1.10 — `releaseLock` is an unconditional DEL, not compare-and-delete — breaks mutual exclusion under the TTL race above**
`apps/worker/src/lib/redlock.ts:10-12`
When the lock expires mid-run (1.9) and a second run acquires it, the first run's eventual `releaseLock()` call deletes *whatever lock currently exists* — possibly one a third run just acquired. This turns a already-fragile TTL race into a repeatable mutual-exclusion failure.
**Fix:** token-based compare-and-delete (Lua script checking the value before deleting).

**1.11 — Concurrent knockout advancement can create duplicate/corrupt Final match rows**
`apps/api/src/modules/tournaments/tournaments.service.ts:859-902`
No transaction/row lock when advancing a winner into the next bracket slot, and no unique DB constraint on `(tournament_id, round_number, bracket_slot)` to catch it at the database level either. Two semifinal matches finishing close together (common) both read "no Final row yet" and both insert one — two half-filled Final rows, neither playable.
**Fix:** wrap in a transaction with `SELECT ... FOR UPDATE`, and add the missing unique index as a backstop.

**1.12 — Round closure has no re-check for in-flight matches — resolving a match after its round closed can resurrect eliminated participants**
`apps/api/src/lib/match-outcome.ts:122-158`, `apps/api/src/modules/tournaments/tournaments.service.ts:727-829`
Advancement logic checks only the match's frozen `phase` value, never whether the tournament's *current* round/phase still matches. If a match resolves after its round has already closed (or after knockout started), applying the outcome can flip a participant back to `'active'` pointing at a superseded round, or eliminate someone who'd already advanced.
**Fix:** re-verify `match.round_number === tournament.current_round_number AND tournament.phase = 'normal'` inside the same transaction before applying advancement side effects.

**1.13 — VR-only matches with no venue slot can never expire — players get permanently stuck**
`apps/worker/src/jobs/expire-unplayed-slots.job.ts:16-23` (inner-joins to `time_slots`, so slot-less matches are invisible to it), `apps/worker/src/jobs/expire-matches.job.ts:16-21` (only targets `pending_confirmation`; tournament matches auto-confirm and skip this state entirely)
A VR-vs-VR match (very common — it's the primary path) that never receives both scores stays `confirmed`/`in_progress` forever. Both players are then permanently blocked from re-queueing (`requeue-player.ts` blocks on any active match in that status set), and the no-show player pays zero rating penalty while their opponent is stuck.
**Fix:** add a timeout job for `confirmed`/`in_progress` matches with `time_slot_id IS NULL`, and record a forfeit for non-responders.

### Database / migrations

**1.14 — A non-idempotent, irreversible migration can permanently halt the migration pipeline**
`packages/db/migrations/1738000000011_tournament-flow.sql`, `packages/db/scripts/apply-tournament-flow-migration.mjs`
This migration drops a column and adds another without `IF NOT EXISTS` guards, and the accompanying "apply" script runs the SQL directly without recording it in `pgmigrations` — so the migration tracker doesn't know it already ran. If it's ever run both ways (manual script, then `pnpm migrate:up`), the second run fails on "column already exists" and **halts all future migrations indefinitely**. Its down-migration is written as SQL *comments* — not actually reversible even if invoked.
**Fix:** make the migration idempotent, ensure the apply script records itself in `pgmigrations` (or remove these one-off scripts and route all schema changes through the standard migration runner), and write a real down-migration or explicitly document the point of no return.

**1.15 — That same migration drops a data column (`format`) with no backup — permanent data loss**
`packages/db/migrations/1738000000011_tournament-flow.sql:7-9`
Each tournament's format value is discarded with nothing preserving it, and it can't be recovered (see 1.14 — down is non-functional).
**Fix:** archive the column's data before dropping in any future schema change of this kind.

**1.16 — Seed/reset/repair scripts have no environment guard — can be pointed at a production database**
`packages/db/scripts/db-reset.mjs`, `packages/db/seeds/dev.ts`, `packages/db/scripts/repair-schema.mjs`
None of these check `NODE_ENV` or validate `DATABASE_URL` before running. `db-reset.mjs` unconditionally `DROP TABLE ... CASCADE`s core tables. The seed script upserts a `superadmin` account with a publicly-documented password (`password123`, written in the README) — if this script is ever run against a live database (misconfigured `.env`, wrong shell), it's either total data loss or a public-password admin account on production.
**Fix:** hard guard on `NODE_ENV !== 'production'` and/or an allow-list check on `DATABASE_URL` before any DDL/DML in these scripts.

---

## 2. High-severity issues

| # | Issue | Location |
|---|---|---|
| H1 | No refresh-token-reuse detection — a stolen refresh token going undetected gives an attacker a silent persistent session | `auth.service.ts:107-126` |
| H2 | `authRateLimit` never actually keys by user — middleware runs before `authenticate()` sets `req.user`, so it silently degrades to the shared IP limiter on every "per-user" rate-limited route | `app.ts` vs `rateLimit.ts:42-44` |
| H3 | No login-specific brute-force throttling — `/auth/login` shares a generic 20 req/min-per-IP bucket with unrelated public traffic; trivially bypassed with rotating IPs, no lockout/backoff/CAPTCHA | `app.ts:47-51`, `rateLimit.ts:37-40` |
| H4 | Meta integration key falls back to a source-committed default with no runtime guard refusing to serve on the sample value (Stripe/AWS have this guard; Meta doesn't) | `metaAuth.ts`, `env.ts:20` |
| H5 | Meta score submission has no per-device session binding — one shared fleet-wide key lets anyone submit/read scores for any player indefinitely | `meta.service.ts:127-135` |
| H6 | No reconciliation job for buybacks stuck `pending` (paid but never fulfilled) if a webhook is lost or post-commit steps throw | `stripe.ts:128-148` |
| H7 | Round-closure polling runs hourly while the minimum round duration is 15 minutes — rounds can sit expired up to ~59 minutes with no expiry check blocking new joins/pairings in the meantime | `worker/src/index.ts:45` vs `shared/src/round-duration.ts:9` |
| H8 | Knockout bracket generation has no bye handling for odd player counts — the odd player out is silently left in `knockout` status with no match and no path forward | `tournaments.service.ts:831-857` |
| H9 | Concurrent `/tournaments/:id/enter` calls can create an orphaned duplicate booking that consumes venue capacity for nothing | `tournaments.service.ts:239-350` |
| H10 | `bookings` table has no usable index for slot-only lookups (capacity checks, cascade-cancel) | `packages/db/migrations/1738000000003...sql` |
| H11 | `users.role` has no DB-level constraint (every other status column does) — a bad direct SQL write can produce a garbage role that authorization logic mishandles | `1738000000001_extensions-and-users.sql:15` |
| H12 | Unbounded growth — no cleanup job for `refresh_tokens`, `notifications`, or `audit_logs`; will degrade indexes and inflate backups over time | worker jobs (absence) |
| H13 | Notification email isn't idempotent against job retry — a transient DB error *after* a successful send causes BullMQ to retry the whole job and re-send the email | `dispatch-notification.job.ts:111-154` |
| H14 | Redis queue removal happens before the Postgres COMMIT in the pairing job — a crash in that window silently drops two real players from the queue with no match and no error surfaced | `pair-players.job.ts:393-408` |
| H15 | No verified production Docker build path — compose and CI both only ever exercise `development`/intermediate `build` stages; the worker's `production` stage has never been built anywhere | `docker-compose.yml`, `ci.yml:87-89`, all three Dockerfiles |

---

## 3. Medium-severity issues

- **Non-timing-safe secret comparisons** for the Meta API key/SSH key (`metaAuth.ts:10-11`) — use `crypto.timingSafeEqual`.
- **Login timing side-channel** distinguishes "unknown email" from "wrong password" by skipping the bcrypt compare on the not-found path (`auth.service.ts:89-100`) — enables email enumeration.
- **`getClientIp()` trusts `X-Forwarded-For`/`X-Real-IP` unconditionally**, independent of the configured proxy hop count (`client-ip.ts:9-23`) — currently low blast radius (geo lookups only) but a spoofable primitive.
- **Admin integrations endpoint leaks a partial API key** and is reachable by any admin tier, not just superadmin (`integrations.service.ts:8-15`).
- **Tournament router (including buyback checkout) isn't covered by the per-user rate limiter**, only the shared per-IP one (`app.ts:56`).
- **Email templates interpolate admin-entered text unescaped** — currently mitigated by username's strict character-set validation, but venue/tournament names aren't similarly constrained (`worker/src/templates/*.email.ts`).
- **`mailer.ts` in the API package is dead code** duplicating the worker's real SES implementation, with a misleading "Resend" provider label in admin config that isn't actually wired to anything.
- **Admin buyback refund doesn't check the player's current tournament state** before forcing `eliminated` — can desync a player who already advanced further, and doesn't remove them from the matchmaking queue if currently queued.
- **`findBestPair` pairing algorithm is up to O(n⁴)** in the worst case (`packages/shared/src/pairing.ts:86-109`) — fine at current scale, will bite a popular tournament's queue eventually.
- **`playersToAdvance` silently floors odd active-player counts** with no bye/odd-player accounting built into the shared primitive itself (`round-advancement.ts:17-20`).
- **Islamabad is seeded with a real venue and tournament but missing from the supported-cities/geo-coordinate maps** — city dropdowns and GPS-to-city snapping will never resolve it.
- **Email fields have no max-length validation** unlike every other user-facing string field — an overlong email passes Zod, then throws an ugly raw Postgres error on insert.
- **Match created but notification dispatch can be skipped entirely** if the worker crashes between the DB commit and the notification enqueue — no outbox pattern or reconciliation.
- **Access token stored in `localStorage`** (XSS exposure, though no `dangerouslySetInnerHTML`/`eval` sinks were found anywhere in the frontend, which limits realistic exploitability today).
- **Socket reconnection can present a stale/expired token** — `auth` is passed as a static object, not refreshed on token rotation, and there's no `connect_error` recovery path.
- **No non-root user in any Dockerfile** — standard container-hardening gap.
- **No health checks or restart policies for api/worker/web services** in `docker-compose.yml` (only postgres/redis have them) — a crashed worker just stays dead.
- **Silent/batch-blocking error handling** in `expire-matches.job.ts` (no logging on per-match failure) and `close-round.job.ts` (one bad tournament blocks the whole hourly batch from processing any others).
- **No dead-letter handling or alerting on failed BullMQ jobs** — `console.error` only; matchmaking jobs default to a single attempt with no retry.

---

## 4. Low-severity / hygiene

- No `process.on('unhandledRejection'/'uncaughtException')` safety net in the API or worker process.
- Rate limiter fails open (disables itself) silently on a Redis outage, with no alerting.
- Password policy is length-only (acceptable per current NIST guidance given bcrypt cost 12, but worth pairing with a breached-password check given real money is involved).
- `logout()` revokes all sessions for a user, not just the current one — confirm this is the intended multi-device behavior.
- `JWT_REFRESH_SECRET` is required in config but never actually used (refresh tokens are opaque random values, not JWTs) — dead/misleading config.
- Worker graceful shutdown has no timeout — a hung job blocks shutdown until Docker sends SIGKILL, defeating the purpose of graceful shutdown.
- No top-level React error boundary — an unexpected render error blanks the entire app to a white screen.
- CI (once re-enabled) has no lint step, and the API test step is scoped to a single test file rather than the full suite.
- Test coverage is heavily concentrated on pure functions (pairing math, rating math); none of the actual job/lock/retry/webhook code paths — exactly where the critical races above live — have integration-level test coverage.
- Duplicated slot-locking logic maintained independently in both `apps/api` and `apps/worker`, risk of drift.
- No `pool.on('error', ...)` handler on the Postgres pool — an idle client error with no listener can crash the whole API process; no SSL config for non-local deployments.
- No LICENSE file at the repo root.

---

## 5. What's already solid

- Booking double-booking is correctly prevented with `SELECT ... FOR UPDATE` plus a DB unique constraint — verified by a passing concurrent-booking integration test.
- Match confirm/decline correctly uses row locking to serialize the "one confirms, one declines" race.
- Cross-instance Socket.IO delivery is properly designed for horizontal scaling via the Redis adapter and a worker→API event bridge.
- Stripe webhook signature verification is correctly implemented (raw body captured before the JSON body parser runs) — not spoofable.
- Stripe frontend integration uses PCI-safe Elements/PaymentElement with server-issued client secrets; no raw card data touches app code.
- PostGIS is used correctly — GIST-indexed geometry column, proper `ST_DWithin`/`ST_Distance` queries, no N+1 pattern.
- Passwords hashed with bcrypt(12); refresh tokens are opaque, hashed at rest, and rotated on every use.
- The core matchmaking/rating/round-advancement math lives in one shared package used by both the API and worker — avoids logic drifting between two implementations.
- `close-round` job is correctly idempotent against BullMQ retries via row locking.
- No secrets leak into the frontend bundle; a custom Vite build plugin actively fails the build if `localhost` or a missing API URL would ship to production.
- CORS is a locked single origin, not a wildcard; `helmet()` is applied globally; SQL is parameterized everywhere reviewed (no injection risk found).

---

## 6. Suggested remediation order

1. **Secrets** (section 0) — same day.
2. **Re-enable CI** so nothing further ships unverified — same day.
3. **Critical access-control gap (1.1)** — this is the single highest-impact fix; it's a config/wiring problem in `admin.routes.ts`, not a redesign.
4. **The four payment/score races (1.5–1.8)** — real money and match integrity; each fix is a small transactional/locking change to an existing code path.
5. **Matchmaking locking (1.9–1.13)** — the Redlock TTL/compare-and-delete fix is small and de-risks several downstream symptoms at once.
6. **Migration hygiene (1.14–1.16)** before anyone runs migrations against a real production database.
7. Work through High, then Medium, in the order listed — most are localized, single-file fixes.
8. Backfill integration-level tests for the job/lock/webhook code paths so these classes of bugs are caught by CI going forward, not by a client report.
