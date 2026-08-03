# VR Cricket League — UX Audit

**Method:** code-level review of `apps/web` (React 19/Vite/Tailwind 4) — page components, shared UI primitives, Tailwind theme, and accessibility markers. No live browser/screenshots were used, so this reads structure, copy, and conditional-rendering logic rather than pixels; treat visual polish (contrast, exact spacing) as unverified until seen live.

**Verdict:** the player-facing core flow is genuinely well built — better than most codebases at this stage. The admin panel is the weak point: consistent structure, but almost no feedback loop, which is a real risk given how many irreversible actions live there (refunds, role changes, tournament state transitions). Nothing found requires a redesign; the fixes are mostly "add one shared component and use it everywhere."

---

## Player-facing app: solid

- **Register/login forms are textbook-good.** Live username/email availability checks, errors that only appear after blur (not on first keystroke), password strength meter, specific geolocation failure messages, proper `<label>`/`aria-invalid`/`role="alert"` wiring.
- **The core conversion flow (enter tournament → book slot/queue → confirm match) is the best-built part of the app.** `SlotConfirmModal` has real dialog semantics (Escape, scroll lock, `aria-modal`), optimistic updates with rollback, and a genuinely good error-message layer (`lib/user-messages.ts`) that turns backend error codes into specific, actionable copy instead of generic failures.
- **Matches page has the clearest "what state am I in" messaging in the app** — distinct copy for every confirm/wait/score-pending combination, matching exactly what the README promises about VR score submission.
- **Loading/empty states are a real shared system** (`Skeleton`/`GridSkeleton`/`EmptyState`/`RouteFallback`), consistently used across most pages, with layout-matching skeletons rather than generic spinners.
- **Mobile handling is better than average**: the knockout bracket and date/slot pickers use deliberate horizontal-scroll/stacking patterns rather than just breaking on small screens.

**Gaps worth fixing:**
- **Every "undo/leave" action is one click with no confirmation** — withdraw from a tournament, cancel a booking, decline a match. Every "commit/enter" action, by contrast, has a full confirm modal. This asymmetry is the single biggest player-side issue.
- Matchmaking queue wait has no progress signal (position, ETA, timeout messaging) — just "matching now…" indefinitely.
- No UI indicator when the socket disconnects (the hook already tracks connection state, it's just not surfaced).
- A couple of pages (`VenueDetailPage`, the venue picker in the enter flow) skip the shared loading/empty pattern and fall back to raw unstyled text or nothing at all.
- Notification bell shows category only ("match found"), not which tournament/opponent — user has to go find the page to get real info.
- A handful of icon-only buttons (notification bell, one modal's close button) have no accessible name.

## Admin panel: the weak point

- **Zero confirmation dialogs anywhere in the admin panel** — including Stripe refunds, promoting a user to superadmin, suspending an account, force-overwriting a match result, and closing a tournament round. These are exactly the actions where a misclick is expensive and hard to undo.
- **No admin mutation shows an error.** Every mutation defines `onSuccess`; essentially none define `onError`, and there's no toast/snackbar system in the app at all. If an action fails or gets rejected (e.g., a `venue_admin` hitting a superadmin-only action), the button just goes back to normal with zero explanation.
- Route-level role gating only checks "is this any kind of admin," not "is this the right kind of admin" — a scoped admin can navigate straight to a page they shouldn't see, and because of the error-visibility gap above, a resulting 403 just looks like an empty list, not a permissions problem.
- Two places let an admin change the same tournament status field with very different levels of guardrail (a guided lifecycle button bar on one screen, a raw status dropdown on the edit form) — the guardrails on one can be bypassed via the other.
- One genuinely nice touch: the buyback/refund screen and the user-admin-controls card *do* correctly hide themselves for the wrong role — proving the pattern is known, just not applied consistently.

## Design system: good bones, some duplication

- Buttons, inputs, and cards are consistently reused everywhere — zero raw `<button>` elements found outside the shared component, which is a strong signal of discipline.
- Colors, radius, and spacing mostly flow from one centralized Tailwind 4 theme, not scattered hardcoded values.
- Two separate things exist twice with drifting implementations: **modals** (one has real dialog semantics/accessibility, the other doesn't) and **status badges** (a player-facing system and a separate admin `StatusPill` with a different, non-matching color map for the same status values). Both should collapse to one shared version.
- No toast/notification system exists at all — this is the one missing primitive that would fix most of the admin feedback gap in a single change.

---

## If you fix three things

1. **Add one shared confirm-dialog and use it on every destructive/irreversible action** (admin refunds, role changes, round-closing, match overrides; player-side withdraw/cancel/decline). This is the highest-impact, lowest-effort fix in the whole review.
2. **Add one global toast system and wire it into every mutation's `onError`/`onSuccess`**, especially in the admin panel where it's currently just missing.
3. **Consolidate the two modal implementations and the two status-badge systems into one each** — closes the accessibility gap on `MatchFoundModal` for free and stops the color-palette drift.

Everything else in this review is smaller and more localized — see the underlying flow-by-flow notes for specifics if useful.
