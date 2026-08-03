import { describe, expect, it } from '@jest/globals';
import { findBestPair, findPartner } from '@vr-tournament/shared';

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

    it('never pairs players whose play windows do not overlap', () => {
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
      expect(findBestPair(entries, now)).toBeNull();
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
});
