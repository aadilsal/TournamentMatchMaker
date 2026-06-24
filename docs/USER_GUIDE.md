# VR Cricket League — User Guide

Welcome to VR Cricket League. This guide walks you through the site from your first visit to playing in a tournament match.

## What is VR Cricket League?

VR Cricket League is a tournament platform for VR cricket. You register for events, get automatically matched with opponents by skill level, and compete through round-based play until a knockout champion is crowned.

You can play in two ways:

- **With a Meta Quest headset** — queue from home; no venue booking needed.
- **Without a headset** — book a time slot at a nearby VR arena; we match you there.

---

## Site Map

| Page | URL | Who can access |
|---|---|---|
| Home | `/` | Everyone |
| Log in | `/login` | Everyone |
| Register | `/register` | Everyone |
| Tournaments | `/tournaments` | Everyone (join requires login) |
| Tournament detail | `/tournaments/:id` | Everyone |
| Enter tournament | `/play?tournament=:id` | Logged-in players |
| Venues | `/venues` | Everyone |
| Venue detail | `/venues/:id` | Everyone |
| Bookings | `/bookings` | Logged-in players |
| Matches | `/matches` | Logged-in players |
| Profile | `/profile` | Logged-in players |
| Public profile | `/players/:username` | Everyone |
| Welcome (onboarding) | `/welcome` | New registrants |
| Admin panel | `/admin` | Admin roles only |

### Navigation bar

When logged in, the top navigation shows:

- **Tournaments** — browse and join events
- **Venues** — find VR arenas near you
- **Matches** — your active and past matches
- **Bookings** — your venue reservations
- **Bell icon** — notifications (new match, round updates, etc.)
- **Profile** — edit your account
- **Admin** — visible only to admin accounts

---

## Getting Started

### Step 1 — Create an account

1. Go to **Register** (`/register`) or click **Register** in the top-right corner.
2. Fill in your email, username, password, and city.
3. Tell us whether you have a **Meta Quest VR headset** — this changes how you enter tournaments.
4. After registration you land on the **Welcome** page with personalized next steps.

> **Tip:** If you don't have a headset, pick a city close to you. We use your location to suggest nearby VR venues.

### Step 2 — Complete your profile

Visit **Profile** (`/profile`) to:

- Upload an avatar
- Confirm your city and coordinates (improves venue search)
- View your **skill tier** and **rating points**
- See your VR device type (if applicable)

Your public profile is visible at `/players/your-username`.

### Step 3 — Browse tournaments

Open **Tournaments** (`/tournaments`) to see all events:

| Status | Meaning |
|---|---|
| **Open** | Registration is open — you can join |
| **In progress** | Tournament is running — join only if registration is still open |
| **Completed** | Finished — view bracket and results |

Click a tournament to open its detail page. You'll see:

- Tournament info (dates, skill tier, current round)
- **Normal** tab — round-by-round match list
- **Knockout** tab — bracket (appears once knockout phase starts)
- **Join** / **Withdraw** buttons (when logged in)

---

## Entering a Tournament

Click **Join tournament** on a tournament detail page. You'll be taken to the enter flow at `/play?tournament=:id`.

### If you have a VR headset

1. You'll see the tournament name and a **Find my match** button.
2. Click it — you are registered and placed in the matchmaking queue immediately.
3. No venue booking is required.
4. Head to **Matches** (`/matches`) or watch the notification bell for your pairing.

### If you don't have a VR headset

1. **Pick a venue** — choose from VR arenas listed for your area.
2. **Pick a date** — select a day with available slots.
3. **Pick a time slot** — only slots that fit within the current round window are shown.
4. **Confirm** — review the booking summary and confirm.
5. You are registered, your slot is booked, and you are enqueued for matchmaking.
6. Check **Bookings** (`/bookings`) for your reservation details.

> **Important:** Your booked slot must end before the active round deadline. Slots outside the round window are hidden automatically.

---

## Matchmaking — How Pairing Works

There is **no manual queue button** on the website. Once you enter a tournament, matchmaking happens automatically in the background.

The system pairs you with an opponent based on:

- **Skill tier** — players of similar ability
- **City preference** — same-city matches are preferred
- **Wait time** — tier tolerance widens the longer you wait

### While waiting

- Your tournament card may show **Finding opponent…**
- You can play a **solo innings** in the Meta Quest app to set a chase target (VR players)
- Check `/matches` periodically or wait for a notification

### When a match is found

You'll receive:

1. A **notification** (bell icon in the header)
2. A new entry on **Matches** (`/matches`) with status **Pending confirmation**

---

## Playing a Match

### On the website

1. Go to **Matches** (`/matches`).
2. Find your match — it shows your opponent, venue (if applicable), and time slot.
3. Click **Confirm** to accept the match, or **Decline** to reject (you may be re-queued).
4. Both players must confirm within **5 minutes**, or the match expires.

### In VR (Meta Quest)

Match scores are **not entered on the website**. Your Meta Quest app communicates directly with our servers:

1. Open the VR Cricket app on your headset.
2. The app fetches your current match and opponent details.
3. Play the match in VR.
4. Scores are submitted automatically from the headset.
5. When both players' scores are in, the match is resolved and standings update.

> If you have a VR headset, make sure you're logged into the same account in the Quest app.

---

## After a Match

### Win

- Your win count increases in the tournament standings.
- Your global **rating points** go up (+30).
- You stay active for the next round.

### Loss

- Your loss count increases.
- Rating points decrease (−18).
- You may be **eliminated** from the tournament.

### Eliminated? Buy back in

During **normal rounds** (before knockout), you can purchase a **buyback** to get another life:

- Available only while more than half the original field is still competing
- Available only before the current round deadline ends
- Paid via **Stripe** on the tournament detail page or from the buyback prompt on `/matches`
- After payment, you are re-activated and re-enqueued

Buybacks are **not available** during knockout.

---

## Tournament Phases

### Normal rounds

- Players enter the queue and get matched within a round time limit (e.g. 2 days).
- When the round closes, players with the best records advance to the next round.
- Multiple normal rounds may run before knockout.

### Knockout

- Starts when active players drop to **50% or fewer** of the original field.
- Single-elimination bracket: Round of 16 → Quarter-finals → Semi-finals → Final.
- View the bracket on the tournament detail page under the **Knockout** tab.
- No buybacks during knockout — win and advance, or you're out.

### Champion

When the final match completes, the tournament status changes to **Completed**. Results are visible on the tournament detail page and both players' public profiles.

---

## Venues & Bookings

### Finding a venue

- **Venues** (`/venues`) lists VR arenas.
- Use city search or allow location access for distance-sorted results.
- Each venue shows address, city, capacity, and available slots.

### Booking a slot independently

You can book a venue slot without entering a tournament from the venue detail page. Tournament enter flow also books a slot as part of registration.

### Managing bookings

**Bookings** (`/bookings`) shows all your reservations with date, time, venue, and status. You can cancel a booking from this page if needed.

---

## Notifications

Click the **bell icon** in the header to see notifications:

- Match found — confirm your pairing
- Match confirmed — both players accepted
- Match completed — see the result
- Round closed — advancement or elimination
- Tournament updates — registration open/close, knockout start

Notifications update in real time. You don't need to refresh the page.

---

## Skill Tiers & Ratings

Every player has **rating points** and a **skill tier** (1–5):

| Tier | Minimum rating points |
|---|---|
| Tier 1 | 0 |
| Tier 2 | 500 |
| Tier 3 | 800 |
| Tier 4 | 1,200 |
| Tier 5 | 1,700 |

- New players start at **650** points (Tier 2).
- Wins add **+30** points; losses subtract **−18**.
- Tournaments may restrict entry by skill tier.
- Your tier is shown on your profile and public profile page.

---

## Quick Reference — Common Tasks

| I want to… | Go to… |
|---|---|
| Create an account | `/register` |
| Join my first tournament | `/tournaments` → pick one → **Join tournament** |
| Book a venue without a tournament | `/venues` → pick venue → book slot |
| See if I got matched | `/matches` or bell icon |
| Confirm a match | `/matches` → **Confirm** |
| Buy back into a tournament | `/matches` (prompt) or tournament detail → **Buy back** |
| View the knockout bracket | `/tournaments/:id` → **Knockout** tab |
| Change my profile or avatar | `/profile` |
| See another player's stats | `/players/:username` |
| Cancel a booking | `/bookings` |
| Log out | Profile menu or header **Log out** |

---

## FAQ

**Do I need a VR headset?**
No. You can play at a partner VR venue by booking a time slot. VR headset owners can play remotely without booking.

**How long do I have to confirm a match?**
Five minutes. If neither player confirms, the match expires and slot locks are released.

**Can I join multiple tournaments at once?**
You can register for multiple tournaments, but you can only be actively queued in one matchmaking pool at a time per tournament.

**Why can't I see any time slots?**
Slots may be full, outside the current round window, or the venue has no availability for the selected date. Try another date or venue.

**Why is buyback unavailable?**
Buybacks are only offered during normal rounds, before the round deadline, and while more than half the original field is still active. They are disabled during knockout.

**Where do I enter my match score?**
Scores are submitted from the Meta Quest VR app, not the website.

**I forgot my password.**
Contact an administrator — self-service password reset is not yet available.

---

## Need Help?

- Browse open tournaments at `/tournaments`
- Check your active matches at `/matches`
- Review your bookings at `/bookings`
- Update your profile at `/profile`

For technical integration (Meta Quest app), see [META_INTEGRATION_API.md](META_INTEGRATION_API.md).
