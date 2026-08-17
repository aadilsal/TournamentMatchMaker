import { isSameCity } from './locations.js';
import { slotsOverlap } from './slot-utils.js';

export interface QueueEntry {
  userId: string;
  joinedAt: number;
  city: string;
  skillTier: number;
  roundNumber: number;
  hasPlayedSolo?: boolean;
  soloPlayedAt?: number;
  slotStartAt?: number | null;
  slotEndAt?: number | null;
  /** Opponent this entry owes a rematch to after a draw. */
  rematchWith?: string | null;
}

export function tierDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

/** Tier band widens as players wait longer in queue. */
export function maxTierTolerance(waitSeconds: number): number {
  if (waitSeconds >= 30) return Infinity;
  if (waitSeconds >= 10) return 1;
  return 0;
}

function waitSeconds(entry: QueueEntry, now: number): number {
  return Math.max(0, Math.floor((now - entry.joinedAt) / 1000));
}

function minTierDistanceInRound(entries: QueueEntry[], roundNumber: number): number {
  const sameRound = entries.filter((e) => e.roundNumber === roundNumber);
  let minDist = Infinity;
  for (const x of sameRound) {
    for (const y of sameRound) {
      if (x.userId === y.userId) continue;
      minDist = Math.min(minDist, tierDistance(x.skillTier, y.skillTier));
    }
  }
  return minDist;
}

/**
 * Whether the two players' chosen windows overlap.
 *
 * This is a *preference*, not a requirement. The format is asynchronous — one
 * player sets a target and the other chases it — so they never have to be in
 * VR at the same moment. Requiring an overlap meant two players in the same
 * round could sit in the queue indefinitely simply because one picked the
 * morning and the other the evening.
 *
 * Overlapping pairs still score higher, so a simultaneous match is preferred
 * when one is available.
 */
function slotsOverlapping(a: QueueEntry, b: QueueEntry): boolean {
  const aHasWindow = a.slotStartAt != null && a.slotEndAt != null;
  const bHasWindow = b.slotStartAt != null && b.slotEndAt != null;
  if (!aHasWindow || !bHasWindow) return true;
  return slotsOverlap(a.slotStartAt, a.slotEndAt, b.slotStartAt, b.slotEndAt);
}

/**
 * A pinned pair outranks anything the scorer could produce.
 *
 * The number only has to beat every score `scorePair` can reach, so that two
 * players who owe each other a rematch are taken before an open pair that
 * happens to sit in the same tier — otherwise the rematch waits behind whoever
 * has been queuing longest, and one of the two can be consumed by the general
 * pairing pass in the meantime.
 */
export const REMATCH_PAIR_SCORE = 1_000_000;

function scorePair(a: QueueEntry, b: QueueEntry, all: QueueEntry[], now: number): number | null {
  // The only hard requirements: not yourself, and the same round of the same
  // tournament. Everything else below only ranks the candidates.
  if (a.userId === b.userId) return null;
  if (a.roundNumber !== b.roundNumber) return null;

  // A draw is replayed by the same two players, so an entry that owes a rematch
  // is not a candidate for anyone else — not even a perfect tier match who has
  // been waiting longer. This is a hard exclusion rather than a ranking bonus:
  // scored, the pin would only be a preference, and the pinned player would be
  // paired off with a stranger during the minutes before their opponent has
  // finished picking a window. The pin is mutual by construction; requiring
  // both halves means a stale one-sided pin blocks a match instead of forcing
  // an unwanted one.
  const aPin = a.rematchWith ?? null;
  const bPin = b.rematchWith ?? null;
  if (aPin !== null || bPin !== null) {
    return aPin === b.userId && bPin === a.userId ? REMATCH_PAIR_SCORE : null;
  }

  const dist = tierDistance(a.skillTier, b.skillTier);
  const maxWait = Math.max(waitSeconds(a, now), waitSeconds(b, now));
  const tolerance = maxTierTolerance(maxWait);

  if (tolerance === Infinity) {
    // any tier
  } else if (tolerance === 0) {
    const minDist = minTierDistanceInRound(all, a.roundNumber);
    if (minDist !== Infinity && dist > minDist) return null;
  } else if (dist > tolerance) {
    return null;
  }

  let score = 100 - dist * 10;

  // Prefer players who can be in VR together, without requiring it.
  if (slotsOverlapping(a, b)) {
    score += 15;
  }

  const sameCity = isSameCity(a.city, b.city);
  if (!sameCity) {
    score += 8;
  } else if (maxWait >= 15) {
    score += 4;
  }

  score += Math.min(maxWait, 120) * 0.5;

  if (a.hasPlayedSolo || b.hasPlayedSolo) {
    score += 12;
  }

  const nowMs = now;
  const aUrgency = a.slotEndAt ? Math.max(0, a.slotEndAt - nowMs) : Infinity;
  const bUrgency = b.slotEndAt ? Math.max(0, b.slotEndAt - nowMs) : Infinity;
  const minUrgencyMs = Math.min(aUrgency, bUrgency);
  if (minUrgencyMs < Infinity) {
    const urgencyBonus = Math.max(0, 30 - Math.floor(minUrgencyMs / 60000)) * 2;
    score += urgencyBonus;
  }

  return score;
}

/**
 * Stable identity for an unordered pair, so a pair that could not be turned
 * into a match can be named and set aside without depending on which of the two
 * was scanned first.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Scan all queue pairs — not only FIFO head — and return the best match.
 *
 * `excluded` holds pairs the caller has already tried and failed to turn into a
 * match on this pass. Without it the highest-scoring pair is returned again on
 * every call, so a single pair that cannot be scheduled — no open round, no slot
 * — permanently hid every other pairable player in the same queue.
 */
export function findBestPair(
  entries: QueueEntry[],
  now = Date.now(),
  excluded?: ReadonlySet<string>
): { candidate: QueueEntry; partner: QueueEntry } | null {
  if (entries.length < 2) return null;

  let best: { candidate: QueueEntry; partner: QueueEntry; score: number } | null = null;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (excluded?.has(pairKey(a.userId, b.userId))) continue;
      const score = scorePair(a, b, entries, now);
      if (score === null) continue;

      if (!best || score > best.score) {
        const [candidate, partner] = a.joinedAt <= b.joinedAt ? [a, b] : [b, a];
        best = { candidate, partner, score };
      }
    }
  }

  return best ? { candidate: best.candidate, partner: best.partner } : null;
}

/** @deprecated Use findBestPair — kept for backwards-compatible tests */
export function findPartner(candidate: QueueEntry, others: QueueEntry[]): QueueEntry | null {
  const result = findBestPair([candidate, ...others]);
  if (!result) return null;
  if (result.candidate.userId === candidate.userId) return result.partner;
  if (result.partner.userId === candidate.userId) return result.candidate;
  return null;
}
