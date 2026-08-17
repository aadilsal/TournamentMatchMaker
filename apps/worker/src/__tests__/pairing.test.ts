import { describe, expect, it } from '@jest/globals';
import { findBestPair, findPartner, pairKey } from '@vr-tournament/shared';

describe('pairing algorithm', () => {
  it('returns null when no other players', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 1 };
    expect(findPartner(candidate, [])).toBeNull();
    expect(findBestPair([candidate])).toBeNull();
  });

  it('never pairs a player with themselves', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 1 };
    const others = [{ userId: 'a', joinedAt: 2000, city: 'Karachi', skillTier: 3, roundNumber: 1 }];
    expect(findPartner(candidate, others)).toBeNull();
  });

  it('only pairs same round', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 2 };
    const others = [{ userId: 'b', joinedAt: 2000, city: 'Karachi', skillTier: 3, roundNumber: 1 }];
    expect(findPartner(candidate, others)).toBeNull();
  });

  it('prefers same tier opponents', () => {
    const entries = [
      { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
      { userId: 'b', joinedAt: 2000, city: 'Karachi', skillTier: 5, roundNumber: 1 },
      { userId: 'c', joinedAt: 3000, city: 'Islamabad', skillTier: 3, roundNumber: 1 },
    ];
    const pair = findBestPair(entries);
    expect(pair?.candidate.userId).toBe('a');
    expect(pair?.partner.userId).toBe('c');
  });

  it('prefers cross-city opponents within tier band', () => {
    const entries = [
      { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
      { userId: 'b', joinedAt: 2000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
      { userId: 'c', joinedAt: 3000, city: 'Karachi', skillTier: 3, roundNumber: 1 },
    ];
    const pair = findBestPair(entries);
    const ids = [pair?.candidate.userId, pair?.partner.userId].sort();
    expect(ids).toEqual(['a', 'c'].sort());
  });

  it('falls back to closest tier when no same-tier opponent', () => {
    const entries = [
      { userId: 'a', joinedAt: 1000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
      { userId: 'b', joinedAt: 2000, city: 'Karachi', skillTier: 4, roundNumber: 1 },
      { userId: 'c', joinedAt: 3000, city: 'Islamabad', skillTier: 5, roundNumber: 1 },
    ];
    const pair = findBestPair(entries);
    const ids = [pair?.candidate.userId, pair?.partner.userId].sort();
    expect(ids).toEqual(['a', 'b'].sort());
  });

  it('can pair non-head players when head is unmatchable', () => {
    const now = Date.now();
    const entries = [
      { userId: 'a', joinedAt: now - 5000, city: 'Lahore', skillTier: 3, roundNumber: 2 },
      { userId: 'b', joinedAt: now - 4000, city: 'Karachi', skillTier: 3, roundNumber: 1 },
      { userId: 'c', joinedAt: now - 3000, city: 'Islamabad', skillTier: 3, roundNumber: 1 },
    ];
    const pair = findBestPair(entries, now);
    const ids = [pair?.candidate.userId, pair?.partner.userId].sort();
    expect(ids).toEqual(['b', 'c'].sort());
  });

  it('relaxes tier tolerance after 30s wait', () => {
    const now = Date.now();
    const entries = [
      { userId: 'a', joinedAt: now - 35000, city: 'Lahore', skillTier: 2, roundNumber: 1 },
      { userId: 'b', joinedAt: now - 34000, city: 'Karachi', skillTier: 5, roundNumber: 1 },
    ];
    const pair = findBestPair(entries, now);
    expect(pair).not.toBeNull();
  });

  describe('play windows', () => {
    const HOUR = 3_600_000;

    // The format is asynchronous — one player sets a target, the other chases
    // it — so opponents never have to be in VR at the same moment. Requiring an
    // overlap stranded players who simply picked different times of day.
    it('pairs players whose play windows do not overlap', () => {
      const now = Date.now();
      const entries = [
        {
          userId: 'a',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + HOUR,
          slotEndAt: now + 2 * HOUR,
        },
        {
          userId: 'b',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + 5 * HOUR,
          slotEndAt: now + 6 * HOUR,
        },
      ];
      const pair = findBestPair(entries, now);
      expect(pair).not.toBeNull();
      expect([pair!.candidate.userId, pair!.partner.userId].sort()).toEqual(['a', 'b']);
    });

    it('prefers an overlapping opponent over a non-overlapping one', () => {
      const now = Date.now();
      const entries = [
        // 'a' can pair with either; 'overlap' shares a's window, 'later' does not.
        { userId: 'a', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1,
          slotStartAt: now + HOUR, slotEndAt: now + 2 * HOUR },
        { userId: 'later', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1,
          slotStartAt: now + 5 * HOUR, slotEndAt: now + 6 * HOUR },
        { userId: 'overlap', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1,
          slotStartAt: now + HOUR, slotEndAt: now + 2 * HOUR },
      ];
      const pair = findBestPair(entries, now);
      expect(pair).not.toBeNull();
      expect([pair!.candidate.userId, pair!.partner.userId].sort()).toEqual(['a', 'overlap']);
    });

    it('pairs players whose play windows overlap', () => {
      const now = Date.now();
      const entries = [
        {
          userId: 'a',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + HOUR,
          slotEndAt: now + 2 * HOUR,
        },
        {
          userId: 'b',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + HOUR,
          slotEndAt: now + 2 * HOUR,
        },
      ];
      const pair = findBestPair(entries, now);
      expect([pair?.candidate.userId, pair?.partner.userId].sort()).toEqual(['a', 'b']);
    });

    it('picks the opponent sharing a window over one who does not', () => {
      const now = Date.now();
      const entries = [
        {
          userId: 'a',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + HOUR,
          slotEndAt: now + 2 * HOUR,
        },
        {
          userId: 'far',
          joinedAt: now - 41000,
          city: 'Karachi',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + 8 * HOUR,
          slotEndAt: now + 9 * HOUR,
        },
        {
          userId: 'near',
          joinedAt: now - 39000,
          city: 'Karachi',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + 90 * 60_000,
          slotEndAt: now + 3 * HOUR,
        },
      ];
      const pair = findBestPair(entries, now);
      expect([pair?.candidate.userId, pair?.partner.userId].sort()).toEqual(['a', 'near']);
    });

    it('leaves open-queue players (no window) pairable with anyone', () => {
      const now = Date.now();
      const entries = [
        { userId: 'a', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
        {
          userId: 'b',
          joinedAt: now - 40000,
          city: 'Lahore',
          skillTier: 3,
          roundNumber: 1,
          slotStartAt: now + 5 * HOUR,
          slotEndAt: now + 6 * HOUR,
        },
      ];
      expect(findBestPair(entries, now)).not.toBeNull();
    });
  });

  /**
   * The drain calls findBestPair repeatedly. A pair it could not turn into a
   * match — no open round, no slot to schedule into — used to come back as the
   * best pair on the very next call, so the drain either rebuilt the same doomed
   * match forever or, as it actually did, gave up and left everyone else in the
   * queue unpaired behind them.
   */
  describe('excluding pairs that could not be scheduled', () => {
    const now = Date.now();
    const entries = [
      { userId: 'a', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
      { userId: 'b', joinedAt: now - 40000, city: 'Karachi', skillTier: 3, roundNumber: 1 },
      { userId: 'c', joinedAt: now - 40000, city: 'Islamabad', skillTier: 3, roundNumber: 1 },
      { userId: 'd', joinedAt: now - 40000, city: 'Multan', skillTier: 3, roundNumber: 1 },
    ];

    it('names a pair the same way whichever order it is given', () => {
      expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
      expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
    });

    it('offers a different pair once the best one is set aside', () => {
      const first = findBestPair(entries, now)!;
      expect(first).not.toBeNull();

      const excluded = new Set([pairKey(first.candidate.userId, first.partner.userId)]);
      const second = findBestPair(entries, now, excluded)!;

      expect(second).not.toBeNull();
      expect(pairKey(second.candidate.userId, second.partner.userId)).not.toBe(
        pairKey(first.candidate.userId, first.partner.userId)
      );
    });

    it('runs out only when every combination has been set aside', () => {
      const excluded = new Set<string>();
      let seen = 0;

      // Mirrors the drain: take the best pair, fail it, take the next.
      for (let i = 0; i < 50; i++) {
        const pair = findBestPair(entries, now, excluded);
        if (!pair) break;
        excluded.add(pairKey(pair.candidate.userId, pair.partner.userId));
        seen++;
      }

      // 4 players → 6 distinct pairs, all reachable.
      expect(seen).toBe(6);
      expect(findBestPair(entries, now, excluded)).toBeNull();
    });

    it('still refuses a pair that breaks a hard rule, excluded or not', () => {
      const crossRound = [
        { userId: 'a', joinedAt: now - 40000, city: 'Lahore', skillTier: 3, roundNumber: 1 },
        { userId: 'b', joinedAt: now - 40000, city: 'Karachi', skillTier: 3, roundNumber: 2 },
      ];
      expect(findBestPair(crossRound, now, new Set())).toBeNull();
    });
  });
});
