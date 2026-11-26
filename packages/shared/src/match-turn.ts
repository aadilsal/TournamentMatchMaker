import { normalizeOvers } from './overs.js';

/**
 * The turn lock.
 *
 * Both players in a match share a play window, so both could enter at once and
 * bat blind — neither had a target, and whoever submitted second was chasing a
 * number they were never shown. That is not a chase; it is two solo innings
 * compared after the fact.
 *
 * A match is now held by one player at a time. The holder bats first and their
 * score becomes the target; the other player is told to wait, and is released
 * to chase a real number the moment the holder submits.
 */

/**
 * How long a hold survives without a score.
 *
 * Six balls take a couple of minutes, so this is generous — it covers a headset
 * that has to be put back on, a slow load, a short interruption. Its real job
 * is the other player: without an expiry, someone who claims the match and
 * walks away locks their opponent out for the rest of the round, and the round
 * closing is the first thing that would notice.
 *
 * Measured from when the hold was granted, not from the last poll, so a client
 * left running on a shelf cannot renew it indefinitely.
 */
export const MATCH_TURN_HOLD_MS = 10 * 60 * 1000;

/** A started innings with no heartbeat for this long is abandoned and counts as 0. */
export const INNINGS_HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

/** How often the headset should send a heartbeat while batting. */
export const INNINGS_HEARTBEAT_INTERVAL_SECONDS = 30;

/** The hold grows with the innings: 10 minutes for one over, 4 more per extra over. */
export function turnHoldMsForOvers(overs: number): number {
  return MATCH_TURN_HOLD_MS + (normalizeOvers(overs) - 1) * 4 * 60 * 1000;
}

/**
 * How long a decided match stays visible on the poll after it resolves.
 *
 * A player who bats first learns nothing from their own submission — it returns
 * while the match is still open — so the result has to reach them on a later
 * poll. Long enough that a headset being taken off and put back on still
 * catches it, short enough that it cannot be mistaken for the current match.
 */
export const MATCH_RESULT_VISIBILITY_MS = 5 * 60 * 1000;

/**
 * Whether a recorded hold still stands.
 *
 * A hold with no timestamp is treated as expired rather than eternal: the only
 * way to get one is a partial write, and the safe reading of "we do not know
 * when this started" is to let the other player claim it.
 */
export function isTurnHoldActive(
  activePlayerId: string | null | undefined,
  activePlayerSince: Date | string | null | undefined,
  now: number = Date.now(),
  holdMs: number = MATCH_TURN_HOLD_MS
): boolean {
  if (!activePlayerId || !activePlayerSince) return false;
  const since = activePlayerSince instanceof Date
    ? activePlayerSince.getTime()
    : new Date(activePlayerSince).getTime();
  if (!Number.isFinite(since)) return false;
  return now - since < holdMs;
}
