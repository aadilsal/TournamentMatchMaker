export interface QueueEntry {
  userId: string;
  joinedAt: number;
}

/** Tekken-style: FIFO candidate, random opponent from the rest of the queue. */
export function findPartner(candidate: QueueEntry, others: QueueEntry[]): QueueEntry | null {
  const eligible = others.filter((o) => o.userId !== candidate.userId);
  if (eligible.length === 0) return null;
  const idx = Math.floor(Math.random() * eligible.length);
  return eligible[idx];
}
