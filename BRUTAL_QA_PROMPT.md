> **How to use this file:** paste everything below the line into a fresh Claude session (Claude Code, Cowork, or a subagent) that has shell + browser access to a running copy of this app. It's written to be self-contained — no other context required. Point it at the repo and let it run.

---

# Brutal QA — VR Cricket League

## Mission

You are an adversarial QA engineer, not a happy-path tester. Your job is to find every place this app breaks, misbehaves, or lets a user do something they shouldn't — **before a client demo does it for us.** Assume the app is guilty until proven innocent: don't stop testing a flow once it works once, keep pushing until you find the edge that breaks it, or you've genuinely exhausted the reasonable attack surface.

Test **both** sides:
1. **Player-facing app** — the web app a real cricket player uses to register, book, and play.
2. **Admin panel** (`/admin/*`) — used by venue admins, tournament admins, and superadmins.

Do not just re-run the existing automated checks and call it done — `scripts/qa-brutal.mjs` and `scripts/qa-brutal-extended.mjs` already cover a solid baseline of API-level happy/sad paths (auth, bookings, matchmaking pairing, buyback, Meta security, IDOR, basic load). Run them first as a sanity floor, then go well past them: through the actual browser UI, with real concurrency, and specifically trying to reproduce the known-risk scenarios in Part 4 below.

## Environment setup

```bash
pnpm install
docker compose up -d postgres redis
cp .env.example .env   # set JWT secrets (32+ chars) if not already set
pnpm migrate:up
pnpm seed               # prints test account list + tournament IDs — read this output
pnpm dev                # API :3000, Web :5173, Worker
```

Seed accounts (password for all: `password123`):

| Email / username | Role | Use for |
|---|---|---|
| `admin@vrtournament.com` | superadmin | Full admin panel access |
| `player@vrtournament.com` | player (non-VR, Lahore) | Bookings, matches, notifications |
| `player2@vrtournament.com` | player (VR, Lahore) | "Find my match" auto-queue |
| `player3@vrtournament.com` | player (non-VR, Karachi) | Karachi Open tournament |
| `player4@vrtournament.com` | player (fresh) | First-time registration / enter flow |
| `player5@vrtournament.com` | player (VR, Karachi) | Queue / "Finding opponent…" state |
| `imam_lefty` | player | Buyback flow on `/matches` |

Run `pnpm seed` again any time you need a clean slate — read its printed output for exact tournament IDs and phase state, since round/knockout timing is time-sensitive.

You'll also want at least one **scoped** admin account (`venue_admin`/`tournament_admin`, not superadmin) to test role boundaries — create one via the superadmin's `/admin/users` panel if the seed doesn't already include one.

## Ground rules

- **Use the real UI, not just the API**, for anything the audits flagged as UI-layer (confirm dialogs, toasts, loading states, error messages). API-only testing will miss whether a fix that's "done" on paper actually shows up on screen.
- **Try real concurrency, not sequential requests that look concurrent.** `Promise.all([...])` firing N genuinely simultaneous requests, or two actual browser tabs racing each other, not a for-loop with awaits in between.
- **Try to break state machines, not just individual endpoints.** The tournament lifecycle (draft → open → in_progress → round loop → knockout → completed) and the buyback flow are where the interesting bugs live — test transitions, not just states.
- **Note what you can't test** (e.g., Meta Quest score submission requires the real S2S flow — simulate it via `curl`/API calls with the documented headers per `docs/META_INTEGRATION_API.md` rather than skipping it).
- When something breaks, **capture enough to reproduce it**: exact steps, exact input, account used, timestamp, and (for API-level bugs) the raw request/response.

---

## Part 1 — Player-side flows to hammer

For each flow: test the happy path once to confirm it works, then spend most of your time on the edge cases listed.

**Registration / Login**
- Duplicate email/username (exact match, and case-variant — `Player@x.com` vs `player@x.com`).
- Submit with JS-disabled-equivalent requests (raw API calls) bypassing client-side validation entirely — does the server independently re-validate everything the client does (email format, password length, username charset)?
- Extremely long strings in every text field (name, city, username) — does it 400 cleanly or 500?
- Unicode/emoji in username and city fields.
- Geolocation permission denied, geolocation timeout, geolocation returning coordinates with no matching city.
- Register, don't verify anything, immediately try to log in — any state left half-created if a step fails midway?
- Browser back button after successful registration — does `/register` re-render or redirect correctly? Does resubmitting the form double-register?
- Rapid double-click the submit button — does it submit twice / create two accounts or two identical requests?

**Tournament browse / enter flow (`/tournaments`, `/play?tournament=:id`)**
- Enter a tournament with a stale/closed tab open in the background while the round closes in another tab — does the enter flow fail gracefully or silently succeed into a broken state?
- Two browser sessions (or two real seed accounts) attempt to book the **exact same time slot** at the exact same moment — fire the booking requests with `Promise.all`, not sequentially. Confirm only one succeeds and the other gets a clear, specific error (not a 500).
- VR quick-enter: spam the "Find my match" button rapidly — does it queue you multiple times?
- Non-VR path: pick venue → pick date → pick slot → **navigate away before confirming** → come back — is the slot released, or silently held forever?
- Try entering a tournament that's already full, already closed, already in knockout phase, or that you've already withdrawn from.
- Try entering with a manipulated/invalid `tournament=` query param (garbage UUID, another tournament's ID mid-flow via URL edit).
- Withdraw from a tournament, then immediately try to re-enter — allowed or blocked, and is the error message clear either way?

**Matchmaking queue / match confirm**
- Join queue, then close the tab entirely (not just navigate away) — does the server eventually notice and clean up, or does the player sit in the queue forever consuming a matchmaking slot?
- Get matched, then have **both** players decline simultaneously — what state does the match end up in?
- Get matched, one player confirms, the other lets the confirmation window expire — verify there's an actual timeout and the non-responder doesn't block the other player indefinitely.
- Disconnect wifi (or throttle to offline in devtools) while in queue, then reconnect — does the queue position/match-found state recover, or does the UI silently stop updating (this was flagged as a known gap — confirm current behavior)?
- Two tabs open as the same logged-in user, one confirms a match — does the other tab's UI update in real time, or does it let you try to decline a match that's already confirmed?

**Bookings / venues**
- Cancel a booking, then immediately try to book the same slot again — race against another user doing the same.
- Book a slot, then have an admin delete/modify that venue's slots from the admin panel — what does the player's booking page show?

**Buyback (Stripe)**
- Use a real Stripe test card that **fails** (`4000000000000002`) — confirm the UI shows a clear, specific decline reason, not a generic error, and that no buyback/queue state changes.
- Start a buyback checkout, then **abandon it** (close the Stripe form) — is the pending PaymentIntent/buyback row left in a sane state, or orphaned?
- Start a buyback checkout, and while the Stripe form is open in one tab, use the admin panel in another to close the round / advance to knockout — then complete the payment. Does the player get correctly refunded/notified, or does the app silently grant a buyback into a phase that's already moved on? (This maps directly to a known risk area — see Part 4.)
- Double-click "Pay" / submit the payment form twice quickly.
- Try to trigger a second buyback on a tournament while a first is still `pending`.

**Match / score flow (simulate the Meta Quest side via API)**
- Submit a score for a match you're not a participant in.
- Submit two scores for the same match in rapid, genuinely concurrent succession (`Promise.all`) — confirm it doesn't double-apply the result (win/loss counts, rating).
- Submit a negative score, a score of 0, an absurdly large score, a non-integer score.
- Submit a score for a match that's already completed.

**Profile / notifications**
- Change username to one that's taken by someone else, mid-edit-session (someone else claims it between page load and your save).
- Upload a very large avatar image, a non-image file renamed with an image extension, a malformed/corrupt image.
- Notification bell: generate several notifications, mark one read, refresh — does read state persist correctly? Click through to a notification's target — does it actually navigate to the right match/tournament?

---

## Part 2 — Admin panel: re-verify fixes, then hammer role boundaries

`ADMIN_UX_FIXES.md` in this repo claims every item on the original admin UX punch list is now implemented and verified (confirm dialogs, toast feedback, route-level role gating, deduplicated components, etc.). **Don't take that at face value — verify it live, in the browser, as each role.** Specifically:

- For every action listed in `ADMIN_UX_FIXES.md` section 2 (tournament lifecycle actions, match force-confirm/expire/apply-result, buyback refund, user role change, suspend, booking cancel, broadcast, expire-stale-matches, generate slots): **click it and confirm a real confirmation dialog appears**, that cancelling it does nothing, and that confirming it actually performs the action and shows a success/failure toast.
- For every mutation in section 3: trigger a failure condition (e.g., attempt an action you don't have permission for, or submit invalid data) and confirm an error toast/message actually appears — not just that the button re-enables silently.
- Log in as a **scoped** `venue_admin`/`tournament_admin` (not superadmin) and:
  - Try navigating directly to admin URLs outside your scope (a different venue's slot management, `/admin/users`, `/admin/system`) by typing the URL — confirm you're blocked with a real permission message, not shown an empty table.
  - Try the underlying API calls directly (bypass the UI) for actions outside your scope — confirm the backend independently rejects them (never trust frontend hiding alone).
  - As a `venue_admin`, try to add/remove admins on a venue you don't own.
  - As a `tournament_admin`, try to publish/close/complete a tournament you don't administer.
- Tournament detail page: confirm the raw status dropdown on the edit form (if it still exists) can't be used to skip lifecycle steps the guided buttons wouldn't allow (e.g., draft straight to completed).
- Rapid-fire click a lifecycle action (e.g., "Close round") twice quickly — confirm it's not possible to double-trigger it before the button disables.
- Two admins (or two tabs as the same admin) trigger conflicting actions on the same tournament/match at nearly the same time (e.g., both try to close the same round, or one force-confirms a match while the other force-expires it) — what wins, and is the resulting state consistent?
- Generate venue slots for a date range that already has slots — confirm it doesn't silently create duplicates.
- Check the audit log after a batch of admin actions — does every consequential action actually show up there with the right actor?

---

## Part 3 — Cross-cutting adversarial tests

**Concurrency / races** (use real `Promise.all`, not sequential loops):
- N simultaneous requests to book the same slot.
- N simultaneous score submissions for the same match.
- N simultaneous buyback checkout attempts for the same tournament by the same user.
- N simultaneous "confirm match" calls.
- Trigger a manual matchmaking pairing run (`POST /admin/queue/trigger-pair` if available, or wait for the natural cycle) while simultaneously having a player leave the queue — confirm no crash and no player left in a broken paired-but-removed state.

**Security / IDOR** (beyond what `qa-brutal-extended.mjs` already checks):
- Try accessing another player's booking, match, or notification by ID as a different logged-in user.
- Tamper with a JWT (flip a character, use an expired one, use a token issued for a different user) against every protected endpoint category (player, admin, Meta).
- Log out, then immediately reuse the just-invalidated access token — should be rejected everywhere, including the Socket.IO connection (this was a flagged gap — specifically test whether a socket opened before logout can still send `match:confirmed`/`match:declined` after logout).
- Hit the Meta integration endpoints with no `x-meta-ssh-public-key` header at all and no API key — confirm you get rejected, not silently authenticated (this was a flagged critical risk — verify current behavior directly).
- Basic injection probes on every text input (SQLi-style strings, `<script>` payloads, template-injection-style `${...}` strings) — confirm they're stored/rendered safely, not executed or breaking the query.

**Input fuzzing:**
- Malformed JSON bodies, missing required fields, wrong types (string where a number is expected, array where an object is expected) against a sample of write endpoints across auth, bookings, tournaments, admin.
- Extremely large request bodies / long strings.
- Null vs. undefined vs. empty-string for optional fields.

**Session / network edge cases:**
- Let the access token expire naturally (or force it by editing the client-stored token) mid-session — confirm the app either silently refreshes or cleanly redirects to login, not a broken half-authenticated state.
- Simulate the API going down entirely while the user is mid-flow (stop the API container) — confirm the frontend shows a clear "something's wrong" state rather than an infinite spinner or blank screen.
- Throttle network to "slow 3G" in devtools for the enter-flow and admin lifecycle actions — confirm loading states actually appear (this was flagged as inconsistent) rather than the UI looking frozen.

**Mobile / viewport:**
- Run the full player journey at a real small-phone viewport (375×667) — registration form, venue/slot picker, matches page, knockout bracket view.
- Run core admin flows at a tablet-width viewport.

---

## Part 4 — Specifically try to reproduce these (known risk areas from prior audits)

These are called out because they were identified as **critical or high severity** in the earlier code-level production-readiness review. Some may already be fixed — your job is to confirm current live behavior, not assume either way.

1. **Buyback double-grant race** — fire two nearly-simultaneous "complete this payment" signals for the same buyback (if you can't hit Stripe's real webhook twice, replicate by calling the webhook endpoint directly twice with the same event payload) and confirm the buyback is only ever applied once (check `buyback_count`, queue state, and notification count afterward).
2. **Buyback checkout retry after success** — start a checkout, let it succeed, then immediately retry/re-click checkout for the same buyback before the webhook could plausibly have landed — confirm the original successful payment doesn't get marked failed, and confirm no double charge occurs.
3. **Buyback fulfilled into a phase that's already moved on** — start a buyback checkout right before a round closes / knockout starts, let the round close, then complete the payment — confirm the app either rejects/refunds it or correctly reconciles the player into the current phase, rather than silently reactivating them into a stale round.
4. **Score submission lost-update** — fire two concurrent score submissions for the same match (see Part 3) and confirm ratings/win-loss counts aren't double-applied.
5. **Admin scope bypass** — as a scoped `venue_admin`/`tournament_admin`, attempt every action listed in Part 2's role-boundary section and confirm none of them succeed against resources outside your scope.
6. **Meta integration auth bypass** — call any Meta integration endpoint with zero auth headers and confirm it's rejected (this was flagged as a full bypass when `META_SSH_PUBLIC_KEY` is unset — check what's actually configured in this environment and test accordingly).
7. **Matchmaking pairing double-pair** — under load (fire ~20+ queue joins across several accounts at once and trigger pairing), confirm no single player ends up in two matches simultaneously.
8. **Knockout bracket odd-player-count / concurrent-semifinal-finish** — if you can get a tournament down to an odd number of active players at the knockout threshold, confirm every player gets either a match or an explicit bye, not silently dropped. If two semifinal-equivalent matches finish at nearly the same time, confirm only one Final match row is created, not two.
9. **VR-only match with no expiry** — create a match with no venue/time slot attached, don't submit a score for either side, and confirm it eventually expires/forfeits rather than leaving both players permanently unable to requeue.
10. **Seed/reset scripts against the wrong database** — (do this only in a disposable/local environment) confirm `pnpm db:reset` and the seed script either refuse to run or clearly warn when `DATABASE_URL` doesn't look like a local/dev database.

---

## Reporting format

For every genuine bug found, log it like this:

```
### [Severity: Critical / High / Medium / Low] Short title

**Where:** page/endpoint, role/account used
**Steps to reproduce:**
1. ...
2. ...
**Expected:** what should happen
**Actual:** what actually happened (include exact error text / screenshot / response body)
**Suspected cause:** file:line if you can identify it, otherwise "unknown — needs investigation"
```

Group findings by Part (1-4), and at the top of the report give a one-line summary: **X critical, Y high, Z medium/low found**, plus which of the Part 4 known-risk items reproduced vs. did not reproduce vs. couldn't be tested. Save the report as `QA_RUN_<date>.md` in the repo root so it's easy to diff against the next run.

If you extend `scripts/qa-brutal.mjs` / `scripts/qa-brutal-extended.mjs` with new automated checks while doing this (recommended for anything in Part 3/4 that's cheap to script), note which findings are now covered by an automated regression check versus which still require manual/browser verification each time.
