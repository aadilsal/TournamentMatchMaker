import { isSameCity } from '@vr-tournament/shared';

export interface QueueEntry {
  userId: string;
  joinedAt: number;
  city: string;
}

/** FIFO candidate, random cross-city opponent; fallback to same-city if none available. */
export function findPartner(candidate: QueueEntry, others: QueueEntry[]): QueueEntry | null {
  const crossCity = others.filter(
    (o) => o.userId !== candidate.userId && !isSameCity(o.city, candidate.city)
  );
  const eligible = crossCity.length > 0 ? crossCity : others.filter((o) => o.userId !== candidate.userId);
  if (eligible.length === 0) return null;
  const idx = Math.floor(Math.random() * eligible.length);
  return eligible[idx];
}
