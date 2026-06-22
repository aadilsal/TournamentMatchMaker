import { isSameCity } from './locations.js';

export interface QueueEntry {
  userId: string;
  joinedAt: number;
  city: string;
  skillTier: number;
  roundNumber: number;
  hasPlayedSolo?: boolean;
  soloPlayedAt?: number;
  slotEndAt?: number | null;
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

function scorePair(a: QueueEntry, b: QueueEntry, all: QueueEntry[], now: number): number | null {
  if (a.userId === b.userId) return null;
  if (a.roundNumber !== b.roundNumber) return null;

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

/** Scan all queue pairs — not only FIFO head — and return the best match. */
export function findBestPair(
  entries: QueueEntry[],
  now = Date.now()
): { candidate: QueueEntry; partner: QueueEntry } | null {
  if (entries.length < 2) return null;

  let best: { candidate: QueueEntry; partner: QueueEntry; score: number } | null = null;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
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
