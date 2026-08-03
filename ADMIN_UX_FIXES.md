# Admin Panel — UX Fix List

> **Status: all items completed.** See the "Verification" section at the bottom for what was checked.

Concrete edits, grouped so the foundation pieces get built once and every page below just adopts them. File:line references are from the audit; re-check line numbers if the file has changed since.

---

## 1. Build these two shared components first (everything else depends on them)

- [x] **`ConfirmDialog` primitive** — add to `apps/web/src/components/admin/AdminUi.tsx` (or a new `components/ui/confirm-dialog.tsx`). Reuse the dialog semantics already done correctly in `SlotConfirmModal.tsx` (Escape to close, scroll lock, `role="dialog"`, `aria-modal`, focus handling) rather than inventing a third modal pattern.
- [x] **Global toast/snackbar system** — nothing exists in the app at all (no `sonner`/`react-hot-toast`/etc. installed). Add one, mount it at the app root, and expose a simple `toast.success()`/`toast.error()` API.
- [x] **Shared mutation helper** — wrap `useMutation` so `onError` automatically calls `toast.error(getUserErrorMessage(err))` (that helper already exists in `lib/api.ts`, it's just unused in admin) unless a page opts out. This makes error-visibility fixes below a one-line change per page instead of hand-wiring each one.

---

## 2. Wire `ConfirmDialog` into every destructive/irreversible action

| Page | Action | File:line |
|---|---|---|
| Tournament detail | Publish / Close registration / Start / **Close round** / Complete | `pages/admin/TournamentDetailPage.tsx:208-223` |
| Match detail | Force confirm / Force expire / **Apply result** (score override) | `pages/admin/MatchDetailPage.tsx:103-125` |
| Buyback detail | **Refund via Stripe** | `pages/admin/BuybackDetailPage.tsx:53-62` |
| User detail | **Change role** (esp. promote to superadmin) | `pages/admin/UserDetailPage.tsx:101-109` |
| User detail | Suspend / Unsuspend | `pages/admin/UserDetailPage.tsx:146-152` |
| Bookings list | Cancel booking | `pages/admin/BookingsPage.tsx:110-120` |
| Notifications | Send broadcast to all players | `pages/admin/NotificationsPage.tsx:70-73` |
| System | Expire stale matches (bulk) | `pages/admin/SystemPage.tsx:50-57` |
| Venue detail | Generate slots for a date range (risk of duplicate/overlapping slots) | `pages/admin/VenueDetailPage.tsx:63-74` |

Queue "Kick player" (`pages/admin/QueuePage.tsx:72-79`) can skip this — it's low-stakes/reversible.

---

## 3. Add success/error feedback (toast) to every admin mutation

Every mutation currently defines `onSuccess` but not `onError`, and most give no positive confirmation either (Notifications' broadcast button is the sole exception — copy that pattern everywhere).

- [x] All create/edit forms: `TournamentFormPage.tsx`, `UserFormPage.tsx`, `VenueFormPage.tsx`, `BookingFormPage.tsx`, `MatchFormPage.tsx` — currently just `navigate()` on success with no confirmation toast.
- [x] Tournament lifecycle actions (`TournamentDetailPage.tsx:208-223`) — also add `disabled={mutation.isPending}` + a busy indicator; right now this action bar has no loading state at all and nothing stops a double-click.
- [x] Venue slot actions — "Generate slots," "Unlock," "Recount" (`VenueDetailPage.tsx:63-74, 191-209`) — currently zero feedback either way.
- [x] Queue "Trigger pairing" (`QueuePage.tsx:17-20`) — only the passive 5s auto-refresh shows anything happened; add an explicit toast.
- [x] Integrations "Send test email" (`IntegrationsPage.tsx:14-16, 39-41`) — mutation defines no `onSuccess`/`onError` at all currently; this is the clearest "did nothing happen?" case in the panel.
- [x] System "Expire stale matches" — add a result toast ("Expired N matches") since there's currently no way to tell if it did anything without cross-checking the Matches list.
- [x] User detail "Reset password" (`UserDetailPage.tsx`) — currently only implicit feedback (input clears); add an explicit "Password reset" toast.

---

## 4. Fix route-level role gating

- [x] `AdminGuard.tsx:21` currently only checks "is this any admin role" for route access, not "is this the *right* admin role for this route." A `venue_admin` can navigate directly to `/admin/users` and see an empty table (which looks like "no data" instead of "you're not allowed here").
- [x] Either add a per-route role check in `AdminGuard`/`AdminLayout`, or at minimum: when a list query fails with 403, show a distinct "You don't have permission to view this" state instead of the generic empty-list message (this depends on #3's error-surfacing being wired up first).

---

## 5. Close the "two ways to do the same thing with different guardrails" gap

- [x] `TournamentFormPage.tsx:206-220` exposes a raw `status` `<select>` (draft/open/closed/in_progress/completed) on the edit screen that lets an admin jump straight to any status, bypassing the guided Publish → Close registration → Start → Close round → Complete button bar on `TournamentDetailPage.tsx`. Either remove the raw status dropdown from the edit form, or make it enforce the same valid-transition rules as the lifecycle buttons.

---

## 6. Consolidate duplicated components (spills into admin from the shared design-system review)

- [x] **Status badges**: `AdminUi.tsx:384-410` (`StatusPill`) duplicates `components/ui/badge.tsx`'s status-badge helpers with a different, non-matching color map for the same status values (e.g. `draft` renders differently in each). Delete `StatusPill` and use the shared `Badge` + status helpers instead.
- [x] **Select inputs**: `AdminUi.tsx:14-15, 91-105, 163-172` hand-rolls three separate `<select>` blocks with copy-pasted classes instead of using the shared `components/ui/select.tsx`. Replace all three with the shared `Select`.

---

## 7. Smaller, lower-effort fixes

- [x] Move the plain-language `TOURNAMENT_FLOW_GUIDE` copy (currently only shown on `TournamentFormPage.tsx:227`) onto `TournamentDetailPage.tsx` too, next to the actual Publish/Close-round/Complete buttons — right now the explanation and the risky action live on two different screens.
- [x] Notifications "Type" field (`NotificationsPage.tsx:64`) — replace the free-text `<Input>` with a constrained `<Select>` of known notification types to prevent typos that silently produce an unrenderable notification.
- [x] Dashboard `StatCard`s (`DashboardPage.tsx:36-66`) aren't clickable — link each one to the corresponding filtered list view (e.g. "Failed notifications" → `/admin/notifications?status=failed`).
- [x] Participant edit modal on tournament detail (`TournamentDetailPage.tsx:470-538`) exposes raw enum values (`active/eliminated/advanced/knockout/out`) with no explanation of what each status does to the bracket — add short inline help text or a tooltip.
- [x] Tournament detail's Participants/Registrations/Matches/Rounds/Buybacks tabs (`TournamentDetailPage.tsx:272-467`) fetch the full unpaginated list and paginate client-side — fine at current scale, but move to the same `useAdminList` server-side pagination pattern used elsewhere before a tournament gets large.

---

## Suggested order

1. Section 1 (shared components) — everything else is faster once these exist.
2. Section 2 (confirmations) — highest risk-reduction per hour of work.
3. Section 3 (feedback toasts) — pairs naturally with section 2's dialog work.
4. Section 4 (route gating) — quick, closes a real security-adjacent confusion.
5. Sections 5–7 — cleanup, do as time allows.

---

## Verification

- `pnpm --filter @vr-tournament/{shared,web,api,worker} typecheck` — clean
- `pnpm --filter @vr-tournament/web build` — clean
- API tests 25/25 pass, worker tests 12/12 pass
- All 13 admin read endpoints exercised live against a running API as superadmin — all 200
- Role-gating matrix verified for every admin route × every role

### Extra issues found and fixed during the pass (beyond the original list)

- **Every list page silently swallowed query errors.** A 403/500 rendered as "No X match your filters". Added `AdminQueryError`, which distinguishes *forbidden* / *gone* / *request failed* and offers a retry. Wired into all 8 list pages and all 5 detail pages.
- **Detail pages showed "X not found" for any failure**, including network errors — same component now used.
- **`UserPicker` was a plain `<select>` capped at 100 users** — past 100 players an admin literally could not select someone. Replaced with a debounced, server-searched combobox with keyboard nav and ARIA roles.
- **Booking form kept a stale time-slot when the date changed**, so it could submit a slot from a different day.
- **Booking form validation used the API's bare `.uuid()`**, surfacing "Invalid uuid" to admins, and its venue check ran after the schema so it never displayed. Now has its own field messages.
- **Booking form offered `locked` slots** (mid-transaction) as bookable.
- **Notification type filter listed 4 invented types**; the system actually emits 11. Every filter option would have returned zero rows. Split into an authored-broadcast list and a full filter list.
- **`text-destructive` was a dead class** (theme uses `--color-destructive`) on 5 destructive buttons — they rendered with default colour.
- **`Button` had no `type`**, so buttons inside `<form>` implicitly submitted (2 real cases in RegisterPage/ProfilePage).
- **Role change had no success confirmation.**
- **`ConfirmDialog` flashed empty during its exit animation.**
- **Admin form modals had no dialog semantics** — extracted a shared `Modal` (Escape, scroll lock, focus trap + restore, `role="dialog"`).
- **Round automation**: the close-round worker polled hourly while round duration can be set to 15 minutes, so a finished round could stay open ~4x its length. Now polls every 60s and is guarded on `tournaments.status = 'in_progress'`. The tournament page now states the deadline and countdown so the automation is visible.
