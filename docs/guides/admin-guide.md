# VR Cricket League — Admin Guide

How to run tournaments, venues and players from the admin panel (**Admin** in the top menu).

> Tournaments created before November 2026 use the older "classic" format (slots, bookings,
> matchmaking queue). Their pages keep the old controls until they finish; see
> [operations-manual.md](operations-manual.md). Everything below is the current format.

---

## 1. Who can do what

| Role | Sees | Can |
|---|---|---|
| **Superadmin** | Everything | Create tournaments and venues, manage users and roles, integrations, notifications |
| **Tournament admin** | The tournaments assigned to them | Publish, start, close rounds, settle matches, manage players and buybacks for those tournaments |
| **Venue admin** | The venues assigned to them | See who plays at their venue; edit the venue |

Assign admins on the tournament or venue page (**Tournament admins** / **Venue admins**).

## 2. The dashboard

The first page shows the platform at a glance: users, venues, matches, open tournaments,
buybacks and failed notifications. Click any card to open that list.

**Where players are playing** lists how many players in open or live tournaments play at each
venue, and how many play from **Home** on their own headset. Venue admins see only their venues.

## 3. Running a tournament

Diagrams: [tournament lifecycle](../flows/tournament-lifecycle.md) ·
[admin setup](../flows/admin-setup.md).

### Create it

**Tournaments → New tournament** asks for five things:

| Field | Meaning |
|---|---|
| **Name** | What players see, e.g. "Super Over Cup". |
| **Starts** | Registration is open until this moment; round 1 is drawn automatically then. |
| **Each round lasts** | How long players have to play each match (30 minutes to 1 week). |
| **Max players** | Optional limit. Leave empty for no limit. |
| **Buyback price** | Price to buy back in after losing in round 1. **0** turns buybacks off. |

The form previews how many rounds that makes and roughly when it will finish. The tournament is
created as a **draft** — players cannot see it yet.

You can edit these five fields until the tournament starts.

### Publish it

On the tournament page press **Publish**. Players can now see it and join, choosing a venue or
Home.

### Start it

It starts **by itself** at the start time. To begin early, press **Start now** (needs at least 2
players). Registration closes and round 1 is drawn within seconds; every player is told who they
play.

### While it runs

Nothing needs doing. Each round:

1. stays open for the round length,
2. closes at its deadline — or early, as soon as every match in it is decided (round 1 waits for
   its full time when buybacks are on, so knocked-out players can buy back),
3. settles any unplayed match (whoever batted goes through; nobody batted → both out),
4. draws the next round straight away.

The tournament finishes by itself when one player is left, and the champion is announced.

Controls on the tournament page:

| Button | When to use it |
|---|---|
| **Close round now** | End the current round early (for example at a live event). Unplayed matches are settled immediately. |
| **Complete** | Stop the tournament for good. Open matches are cancelled. Use only to abandon it. |
| **Sync stats** | Recount wins and losses if something looks wrong. |

### The tabs

| Tab | Shows |
|---|---|
| **Participants** | Every player, their status (active, eliminated, out), wins and losses |
| **Registrations** | Who joined, when, and **where they play** (venue or Home). Add a player by hand here. |
| **Matches** | Every match with scores and status |
| **Rounds** | Each round's open and close times |
| **Buybacks** | Payments, with refund controls |

### How matches are decided

Diagram: [match and round](../flows/match-and-round.md).

Each player plays one innings in VR; the second chases the first. A tie is replayed in the same
match. If a headset problem needs a manual result, open the match under **Matches** and record
the agreed winner — it counts exactly like a played result, and a match can only be decided once.

## 4. Venues

**Venues → New venue** adds an arena (name, address, city, location on the map). Players see
active venues in step 2 when they join a tournament, nearest first.

A venue's page shows **Players at this venue** — everyone who chose it for an open or live
tournament — so the front desk knows who to expect. Make a venue **inactive** to stop new players
choosing it.

There are no time slots or bookings: players come in any time during the round.

## 5. Players and support

**Users** lets superadmins:

- find a player by username or email,
- reset their password or suspend their account,
- change their role (player, venue admin, tournament admin, superadmin).

**Notifications → Broadcast** sends an announcement to every player's bell.

**Integrations** shows whether email, Stripe and the Meta headset link are configured.
**Send test to me** checks that email actually goes out.

## 6. What players are told

Players get these automatically (bell, and email where marked ✉):

| When | Notification |
|---|---|
| Joined | You're in ✉ |
| 1 hour before start | Starting soon ✉ |
| Round starts | Their opponent, place and deadline ✉ |
| Opponent has played | The score to beat ✉ |
| Round nearly over, not played | Time left ✉ |
| Tie | Replay |
| Won / lost | Through / out (buyback offer in round 1 ✉) |
| Tournament over | Champion ✉, everyone else in-app |

See the [Player Guide](player-guide.md) for exactly what players see.

## 7. Quick answers

| Question | Answer |
|---|---|
| Can players join after the start? | No. Registration closes when round 1 is drawn. |
| What if the number of players is odd? | The lowest seed plays the computer for that round. The computer never goes through. |
| Can a player be in two tournaments? | Yes, with a separate place to play in each. |
| A buyback was paid too late | It is refunded automatically and the player is told. |
| Emails are not arriving | Check **Integrations → Send test to me**; the sender domain must be verified with the email provider. |
