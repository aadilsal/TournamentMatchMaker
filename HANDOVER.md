# VR Cricket League — Handover & Operations Manual

**Who this is for:** anyone taking over the platform — product owner, tournament organiser, venue partner or support staff. It explains what the product does, how a player experiences it, what runs automatically, and how to operate every part of the admin panel.

No engineering knowledge is assumed. Where something is worth knowing but technical, it sits in a *"Behind the scenes"* note you can skip.

> There is also `docs/USER_GUIDE.md`, written for **players**. This document is the operator's view and supersedes it wherever the two disagree — the platform changed after that guide was written (see [What changed recently](#what-changed-recently)).

---

## Contents

1. [The product in one page](#1-the-product-in-one-page)
2. [Key concepts](#2-key-concepts)
3. [The tournament lifecycle](#3-the-tournament-lifecycle)
4. [Player flows](#4-player-flows)
5. [Matchmaking — how pairing actually works](#5-matchmaking--how-pairing-actually-works)
6. [Playing a match & scoring](#6-playing-a-match--scoring)
7. [Buybacks & payments](#7-buybacks--payments)
8. [Admin panel — roles and access](#8-admin-panel--roles-and-access)
9. [Admin panel — every screen](#9-admin-panel--every-screen)
10. [Admin flows — step by step](#10-admin-flows--step-by-step)
11. [What runs automatically](#11-what-runs-automatically)
12. [Notifications](#12-notifications)
13. [Meta Quest integration](#13-meta-quest-integration)
14. [Day-to-day operations & troubleshooting](#14-day-to-day-operations--troubleshooting)
15. [What changed recently](#what-changed-recently)
16. [Known limitations & open items](#16-known-limitations--open-items)

---

## 1. The product in one page

VR Cricket League runs **skill-matched cricket tournaments** played in VR.

A player signs up, joins a tournament, and the platform finds them an opponent automatically — no lobby, no manual fixture list. They play a short cricket innings, the score comes in from the VR headset, and the winner moves to the next round. Rounds repeat until the field halves, then it becomes a knockout bracket until one champion remains.

There are **two ways to play**, and the platform handles both in the same tournament:

| | Where they play | What they must do |
|---|---|---|
| **Has a Meta Quest headset** | At home | Pick a time window they'll be available |
| **No headset** | At a partner VR venue | Pick a venue **and** book a time slot there |

The commercial hooks are **venue bookings** and **buybacks** (an eliminated player can pay to re-enter while the round is still running).

Almost everything is **automatic**. Registration opens and closes on schedule, the tournament starts and finishes on schedule, rounds close on schedule, players are paired within seconds, and results update live. An admin sets a tournament up once and only steps in by exception.

---

## 2. Key concepts

**Tournament** — a competition with a start and end date, a skill tier, and a registration window.

**Registration window** — the buffer *before* play begins during which players can join. You set when it opens and when it closes. Registration shuts on its own at the closing time.

**Round** — a slice of the tournament with its own deadline (the *round duration*, e.g. 2 days). When the deadline passes, the round closes, winners advance and losers are eliminated.

**Phase** — a tournament is in `normal` phase (repeating rounds) until the field halves, then `knockout` (win-or-go-home bracket), then `completed`.

**Participant status** — where a player stands in a tournament:

| Status | Meaning |
|---|---|
| `active` | In the current round, playing |
| `advanced` | Won their round, waiting for the next |
| `knockout` | In the knockout bracket |
| `eliminated` | Knocked out, but can still **buy back** while the round runs |
| `out` | Finished with this tournament — beaten out, withdrawn, or the tournament ended |

**Skill tier (1–5)** — derived from a player's rating points. Pairing prefers same-tier opponents.

| Tier | Rating points |
|---|---|
| 1 | 0 – 499 |
| 2 | 500 – 799 |
| 3 | 800 – 1199 |
| 4 | 1200 – 1699 |
| 5 | 1700+ |

New players start at **650 points (Tier 2)**. A win is **+30**, a loss is **−18**, and rating never drops below zero.

**Time slot** — a bookable window at a venue, with a capacity. Venue players occupy a seat; headset players use the slot only as a *play window*.

**One tournament at a time** — a player may hold a place in only **one** unfinished tournament. They're free again when they withdraw, are knocked fully out, or the tournament ends. This is enforced everywhere, and the tournaments page explains it rather than letting them click and fail.

---

## 3. The tournament lifecycle

A tournament moves through five states. **Every step after publishing happens automatically** — an admin can also force any step early.

```
  draft ──[admin clicks Publish]──▶ open
   │                                  │
   │                     [registration closing time]
   │                                  ▼
   │                               closed
   │                                  │
   │                          [start date]
   │                                  ▼
   │                            in_progress ──┐
   │                                  │       │ rounds close and
   │                          [end date]      │ winners advance
   │                                  ▼       │ automatically
   └──────────────────────────▶  completed ◀──┘
```

| State | What it means | What players see |
|---|---|---|
| **Draft** | Being set up. Not visible to players. | Nothing |
| **Open** | Registration is open. | Listed under *Live & upcoming*, **Join** button |
| **Closed** | Registration has shut; play hasn't started. | Listed, badge reads **Registration closed**, no Join |
| **In progress** | Being played. | Listed as **Live** |
| **Completed** | Finished. | Moves to the **Completed** tab |

**Publishing is the only manual step.** A draft never goes live on its own — that protects you from a half-finished tournament reaching players.

**At the end date**, the tournament closes whether or not the bracket resolved. Unfinished matches are expired, remaining players are retired, and the tournament completes. This is deliberate: it guarantees a tournament can never hang open and trap its players, since a player stuck in a never-ending tournament could never join another.

---

## 4. Player flows

### 4.1 Sign up

`/register` → email, username, password, country/city, and **"do you have a Meta Quest headset?"**

That last answer determines their whole journey, so it's worth getting right. They can change it later in **Profile**.

After registering they land on `/welcome` with next steps.

### 4.2 Browse and join a tournament

`/tournaments` shows two tabs — **Live & upcoming** and **Completed**.

Each card shows the name, game, skill tier, dates and how many have registered.

- **Join** appears only while registration is genuinely open.
- If the player is already in another unfinished tournament, a banner reads *"You're already playing in **[name]**"* and Join is replaced by a disabled **Already playing** on every other tournament. The one they're in keeps its Join button — that's their way back to it.

### 4.3 Enter a tournament

Clicking Join goes to `/play?tournament=…`.

**Headset players** pick a time window only.
**Venue players** pick a venue first, then a slot at it — which also books their seat.

The date strip only offers **days the round can actually be played on** — from today (or the round's opening day) through the day the round closes. Slots outside the round window are never shown, and are refused if submitted anyway. A line above the picker states when the round runs until.

Once they confirm, they're entered and go straight into the matchmaking queue.

### 4.4 Wait for an opponent

Both `/tournaments` and `/matches` show a live **"Finding opponent…"** card with the queue size. It updates by push, not polling — when a match is found the card is replaced by the real match within about half a second.

### 4.5 Play, and what follows

See [section 6](#6-playing-a-match--scoring). After a match:

- **Win** → advance to the next round.
- **Loss** → eliminated, with the option to **buy back** while the round is still running.
- **Round closes** → winners advance, others are eliminated. When the field halves, the knockout bracket begins.

### 4.6 Other player pages

| Page | What it's for |
|---|---|
| `/matches` | Active and past matches; confirm/decline; buyback prompt |
| `/bookings` | Venue reservations; cancel |
| `/venues`, `/venues/:id` | Find arenas, see slots, book independently of a tournament |
| `/profile` | Edit details, avatar, headset flag; **Meta link code** |
| `/players/:username` | Public profile — record and match history |
| Bell icon | Notifications |

---

## 5. Matchmaking — how pairing actually works

The platform scans the queue **every 2 seconds** and also immediately when someone joins.

**Hard requirements** — a pair is impossible without both of these:

1. Both players are in the **same tournament and the same round**.
2. That round is **still open** (their chosen window sits inside it).

**Time windows do *not* have to overlap.** The format is asynchronous — one player sets a target, the other chases it — so they never need to be in VR at the same moment. Someone who picked the morning can be matched with someone who picked the evening, and each plays in their own window. Overlapping pairs are still *preferred* when both options exist, so a simultaneous match happens where it can.

**Preference, which relaxes over time** — skill tier:

| Waiting | Will pair with |
|---|---|
| 0–10 seconds | Same tier only |
| 10–30 seconds | Within 1 tier |
| 30+ seconds | Any tier |

So a short wait is normal and intended — it's the system trying for a fair match first. Beyond about 30 seconds, if a player still isn't paired, it means nobody else is in the same round of the same tournament.

Pairing also prefers players who have waited longer, those whose slot is about to expire, and those who've already played a solo innings.

> **Behind the scenes.** Tournament matches are auto-confirmed, so neither player needs to accept. Casual (non-tournament) matches need both players to confirm and expire after 5 minutes if they don't.

---

## 6. Playing a match & scoring

**Scores come from the Meta Quest headset only.** The website deliberately does not accept manually typed scores — this is what keeps results trustworthy. Attempting it returns *"Scores must be submitted from your Meta Quest headset."*

The format is a short chase: one player bats and sets a target, the other chases it.

**Each player plays in their own window.** Because pairing doesn't require overlapping windows, the two opponents may play hours apart. The website tells each player where they stand:

| When | What they see on **Matches** |
|---|---|
| Before their window | *"You're all set. Your slot opens Wed, Aug 5, 05:30 (in 6 hours) — put your headset on then."* |
| During their window | *"It's time — put your headset on and play."* |
| After their innings | *"Innings recorded. We're waiting on your opponent…"* |
| Both innings in | *"Both innings are in — working out the result now."* |

There is **no Play button on the website** — play happens entirely in the headset. The site's job is to tell them when, and to show the score once it arrives.

**Solo innings.** A player waiting in the queue can play alone in VR and submit a target score. When they're later paired, that becomes the target their opponent must chase — so waiting isn't dead time.

**Admin override.** If a headset fails, an admin can apply a result by hand from the match detail page. It's audited.

---

## 7. Buybacks & payments

When a player is eliminated during a normal round, they may pay to re-enter.

**A buyback is only offered when all of these hold:**

- The tournament is in **normal** phase (never during knockout).
- Their round is **still running** — the deadline hasn't passed.
- More than half the original field is still competing.

The price is set per tournament. Payment is by card via Stripe.

Once paid, the player returns to `active` and goes back into the queue for that round.

**Refunds** are issued by a superadmin from the buyback detail page.

> **Safeguards worth knowing.** A payment that arrives after the round closes, after knockout begins, or after the tournament ends is **refused rather than applied** — the buyback stays pending so it can be refunded, instead of silently putting a player back into a phase that has moved on. Duplicate payment notifications can never grant two buybacks for one payment.

---

## 8. Admin panel — roles and access

The panel is at `/admin`. There are three admin roles.

| | Superadmin | Tournament admin | Venue admin |
|---|---|---|---|
| Dashboard | Yes | Yes | Yes |
| Tournaments | All | **Only theirs** | — |
| Matches | All | Yes | — |
| Queue | Yes | Yes | — |
| Buybacks | Yes (incl. refunds) | View | — |
| Tournament list (public data) | Yes | Yes | Yes |
| Notifications | Yes | Yes | — |
| Venues & slots | All | — | **Only theirs** |
| Bookings | All | — | **Only at their venues** |
| Users | Yes | — | — |
| System & audit log | Yes | — | — |
| Integrations | Yes | — | — |

**Scoped admins are restricted to their own resources.** A venue admin assigned to *Capital VR Stadium* can manage that venue, its slots and its bookings — nothing else. A tournament admin can run the tournaments they're assigned to and no others.

Sections outside a role's remit are hidden from the sidebar, and typing the URL directly shows a clear permission message rather than an empty page. **The same restrictions are enforced on the server**, so they hold regardless of what the browser does — every admin action was tested against both scoped roles.

Lists are also filtered to what the role owns: a venue admin's venue list shows only their venues, and their booking list only bookings at those venues. Tournament listings are visible to everyone because tournaments are public information anyway.

**Assigning admins is superadmin-only** (Users → change role, then assign them on the venue or tournament page). This is deliberate: the ability to grant admin rights is the ability to grant yourself anything.

**Changes take effect immediately.** Suspending a user, changing their role, or revoking their sessions signs them out at once — including any live browser tab.

---

## 9. Admin panel — every screen

### Dashboard (`/admin`)
At-a-glance counts: users, venues, tournaments, matches, queue size, bookings, buybacks, failed notifications. **Every tile is clickable** and opens the matching filtered list. Quick actions to create a tournament or venue.

Start here each day. The one to watch is **Failed notifications** — a non-zero number means players aren't being told things.

### Tournaments (`/admin/tournaments`)
List with search and status/phase filters. **New tournament** opens the create form.

**Create/edit form.** Required fields are marked with a red asterisk and validated before saving:

- Name, Game
- **Registration opens** / **Registration closes**
- **Start** / **End**
- Normal round duration (minutes / hours / days)
- Max players *(optional)*, Skill tier, Buyback price

The dates must be in order — registration opens before it closes, closes on or before the start, and the start before the end. You'll get a specific message if not. An explainer panel on the page describes how tournaments run.

**Tournament detail** — the operational hub:

- **Lifecycle bar** — Publish, Close registration, Start, Close round, Complete. Each asks for confirmation and explains the consequence. These are your *manual overrides*; the schedule does all of it on its own otherwise.
- **Tournament admins** — assign someone to run this tournament (superadmin only).
- **Tabs** — Participants (with editable status), Registrations, Matches, Bracket, Rounds, Buybacks.

### Matches (`/admin/matches`)
List with status/phase filters. Detail page allows **force confirm**, **force expire** and **apply result** (score override). All confirmed and audited.

### Venues (`/admin/venues`)
List and create. **Venue detail**:

- Details and active flag
- **Time slots** with status (available / booked / full / locked)
- **Generate slots** — bulk-create slots across a date range and hours. Asks for confirmation, since it's easy to create a lot at once.
- **Venue admins** — assign/remove (superadmin only)
- Slot maintenance: unlock, recount

### Users (`/admin/users`) — superadmin only
Searchable list. **User detail**:

- Profile, rating and tier, tournament history, W–L
- **Change role** — with a warning when promoting to superadmin
- **Suspend / Unsuspend** — signs them out immediately and refuses further logins, so they cannot take any action at all (entering, booking, playing) until unsuspended
- **Reset password**
- **Revoke all sessions** — signs them out of everything now
- **Sync tier** — recompute their tier from rating points

### Bookings (`/admin/bookings`)
All venue reservations with status filters; create on a player's behalf; cancel (confirmed).

### Queue (`/admin/queue`)
Live view of who is waiting: player, tournament, round, wait time, solo-target flag. Auto-refreshes.

- **Trigger pairing** — force a pairing run now
- **Kick player** — remove someone stuck in the queue

### Buybacks (`/admin/buybacks`)
All buybacks with status. Detail page shows the payment and offers **Refund via Stripe** (superadmin).

### Notifications (`/admin/notifications`)
Every notification with user, type, channel and status (pending / sent / failed). **Send broadcast** messages all players — it asks for confirmation first, because it cannot be recalled.

### Integrations (`/admin/integrations`)
Read-only status of Meta, email and Stripe, plus **Send test email** to check delivery. Only a masked key preview is shown — never full secrets.

### System (`/admin/system`)
Database and Redis health, table counts, **Expire stale matches**, and the **audit log** — who did what, when, to which record. Every consequential admin action is recorded here.

---

## 10. Admin flows — step by step

### Run a tournament end to end

1. **Tournaments → New tournament.** Fill in the form. Set the registration window to give players a real buffer — e.g. registration opens today, closes in 5 days, tournament starts in 5 days, ends in 12.
2. **Save.** It's created as a **draft** — invisible to players.
3. **Open it → Publish.** It's now live and players can register.
4. **Wait.** Registration closes on its own at the closing time. The tournament starts on its own at the start date. Rounds close on their own at each deadline, and knockout begins when the field halves.
5. **Watch** the tournament detail page — Participants, Matches and Bracket update live.
6. **It completes on its own** at the end date, or when the final resolves.

You only intervene by exception, using the lifecycle bar.

### Onboard a venue partner

1. **Venues → New venue.** Name, address, city, coordinates, capacity.
2. Open the venue → **Generate slots** for the coming weeks.
3. **Users** → find their staff account → **Change role** to *Venue admin*.
4. Back on the venue → **Venue admins** → assign them.

They can now manage that venue's slots and bookings, and nothing else.

### Delegate a tournament

1. **Users** → the person → **Change role** to *Tournament admin*.
2. **Tournaments** → the tournament → **Assign admin**.

They can run that tournament only.

### Handle "my headset broke, the score didn't submit"

1. **Matches** → find the match (filter by status, or open it from the tournament).
2. **Apply result** with the correct scores. Confirm.

Ratings, standings and the bracket update as if it had come from the headset. The override is audited.

### Handle "I paid for a buyback and nothing happened"

1. **Buybacks** → find it. Check the status.
   - **Completed** → they're back in; check the tournament's Participants tab.
   - **Pending** → payment hasn't confirmed, or it arrived after the round closed. If the round has moved on, **refund** it.
   - **Failed** → payment didn't go through; they can try again.

### Handle "I can't join a tournament"

Check, in order:

1. Is registration open? Check the tournament's window — it may have closed.
2. Are they already in another tournament? The banner on their tournaments page names it. They must withdraw or finish it.
3. Is it full? Check Max players against registrations.

### Suspend a problem account

**Users** → the user → **Suspend**. Immediate: they're signed out, can't log back in, and can't book. Reverse with **Unsuspend**.

---

## 11. What runs automatically

Nothing in this list needs a human.

| Every | What happens |
|---|---|
| 2 seconds | Players in the queue are paired |
| 30 seconds | Unconfirmed casual matches older than 5 minutes expire |
| 60 seconds | Matches whose play window has passed with no score expire |
| 60 seconds | Rounds past their deadline close — winners advance, others are eliminated, knockout starts when the field halves |
| 60 seconds | **Tournament lifecycle** — registration closes, tournaments start, tournaments complete |

Plus, continuously: notifications are delivered, and every relevant change is pushed live to open browsers — new match, queue updates, round closures, tournament status changes.

---

## 12. Notifications

Players get in-app notifications (bell icon) and, where configured, email. Types include:

`tournament_registered`, `match_found`, `match_confirmed`, `match_declined`, `match_won`, `match_lost`, `match_expired`, `match_reminder`, `buyback_completed`, `opponent_withdrew_requeued`, `tournament_update`, `announcement`, `system_maintenance`.

Admins can send an **announcement** broadcast to all players.

**Notifications are private.** A player only ever sees their own — verified by testing, including over the live connection.

Watch the **Failed notifications** tile on the dashboard. A rising number usually means an email delivery problem — check **Integrations → Send test email**.

---

## 13. Meta Quest integration

The Quest app talks to the platform over a small dedicated API.

**Linking a headset to an account:**

1. Player opens **Profile** on the website and gets a **4-digit link code**.
2. They enter it in the Quest app (the code is 4 digits and valid for 10 minutes).
3. The app exchanges it for their account identity and remembers it.

**In play, the headset can:**

- Ask what match the player is in right now
- Submit a match score
- Submit a solo-innings target while waiting

The Quest app authenticates with a shared API key. Full technical detail is in `docs/META_INTEGRATION_API.md`.

---

## 14. Day-to-day operations & troubleshooting

### Daily check (2 minutes)

1. **Dashboard** — anything unusual in the counts?
2. **Failed notifications** — should be at or near zero.
3. **Queue** — is anyone waiting far longer than a minute?
4. **System** — database and Redis both healthy.

### Common situations

| Symptom | Likely cause | What to do |
|---|---|---|
| Player stuck "Finding opponent…" | Nobody else is in the same round of the same tournament | Check **Queue**. If they're the only one in their round, that's expected — windows do *not* need to overlap, so anyone else in that round will match them. If several are waiting in the same round and not pairing, use **Trigger pairing** |
| Tournament didn't start | It was still a **draft** — drafts never auto-publish | Publish it, or use **Start** |
| Registration still open past the closing time | The sweep runs every 60 seconds | Wait a minute, or use **Close registration** |
| Player can't join anything | Already in an unfinished tournament | Their banner names it — withdraw or finish |
| Score didn't arrive | Headset submission failed | **Apply result** on the match |
| Nobody is getting emails | Delivery misconfigured | **Integrations → Send test email** |

### Before a big event

- Confirm the registration window gives enough lead time.
- Generate venue slots covering the whole tournament — **slots must fall inside the round windows** or players can't use them.
- Check round duration suits the format (a 2-day round for a week-long tournament).
- Send an announcement broadcast.

---

## What changed recently

If you read `docs/USER_GUIDE.md`, these behaviours have changed since it was written:

1. **The lifecycle is now automatic.** Registration closing, the tournament starting, and the tournament completing all happen on schedule. Previously every step needed an admin.
2. **Tournaments have a registration window** (opens / closes) — the buffer before play begins. Previously registration simply ran until an admin closed it.
3. **"Closed" means registration closed, not finished.** Such tournaments stay under *Live & upcoming*, badged **Registration closed**.
4. **One live tournament per player** is enforced and explained up front, with a banner and a disabled Join button, rather than failing after the click.
5. **The date picker is bounded to the round** — only days the round can be played on are offered.
6. **Suspension, role changes and session revocation take effect immediately**, including on open browser tabs.
7. **The knockout bracket advances correctly.** Previously it could not progress past its first round.
8. **Players no longer need overlapping time windows to be paired.** Same tournament, same open round is enough — each plays in their own window, and the Matches page tells them when theirs opens.

---

## 16. Known limitations & open items

Carried over from the QA reports (`QA_RUN_2026-08-04.md`, `QA_RUN_2026-08-04b.md`) — worth knowing before launch.

| Item | Impact | Action |
|---|---|---|
| **Live Stripe keys are in the development `.env`** | Any test that completes a buyback checkout in dev creates a **real charge** | **Rotate the keys**, and use Stripe *test* keys for development. Highest priority. |
| Buyback checkout can't be fully tested end-to-end | Follows from the above | Resolve the keys first |
| Seeded demo data can't demo a buyback | The seeded eliminated player sits in a knockout-phase tournament, where buybacks are correctly unavailable | Adjust the seed if you want a click-through demo |
| `users.role` has no database-level constraint | The application validates it; a direct database edit could set an invalid role | Add a CHECK constraint |
| Draft tournaments never auto-publish | By design — protects against half-finished tournaments going live | None; publish manually |
| End date force-completes an unfinished tournament | By design — guarantees players are released | Set end dates with enough headroom |

### Verified as working

The following were tested hard and hold up, including under real concurrency: matchmaking under load with no double-pairing; score submission with no double-counting; venue slot booking with no overbooking; tournament capacity limits; admin scope isolation (no cross-scope access from either scoped role); notification privacy; session revocation; the full automatic lifecycle including boundary times; and the registration window.

---

**Questions on anything here?** The two QA reports in the repository root record exactly what was tested and how. `docs/META_INTEGRATION_API.md` covers the headset API, and `docs/USER_GUIDE.md` is the player-facing walkthrough.
