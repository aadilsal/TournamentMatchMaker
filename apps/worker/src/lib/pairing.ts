export interface QueueEntry {
  userId: string;
  skillTier: number;
  joinedAt: number;
}

export function skillWindow(waitSeconds: number): number {
  if (waitSeconds >= 90) return 99;
  if (waitSeconds >= 30) return 2;
  return 1;
}

export function canPair(a: QueueEntry, b: QueueEntry, waitSeconds: number): boolean {
  if (a.userId === b.userId) return false;
  const window = skillWindow(waitSeconds);
  if (window >= 99) return true;
  return Math.abs(a.skillTier - b.skillTier) <= window;
}

export function findPartner(
  candidate: QueueEntry,
  others: QueueEntry[],
  waitSeconds: number
): QueueEntry | null {
  const sorted = [...others].sort((x, y) => x.joinedAt - y.joinedAt);
  for (const other of sorted) {
    if (canPair(candidate, other, waitSeconds)) return other;
  }
  return null;
}
