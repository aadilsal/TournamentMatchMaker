import { describe, expect, it } from '@jest/globals';
import { findPartner } from '../lib/pairing.js';

describe('random pairing algorithm', () => {
  it('returns null when no other players', () => {
    const candidate = { userId: 'a', joinedAt: 1000 };
    expect(findPartner(candidate, [])).toBeNull();
  });

  it('never pairs a player with themselves', () => {
    const candidate = { userId: 'a', joinedAt: 1000 };
    const others = [{ userId: 'a', joinedAt: 2000 }];
    expect(findPartner(candidate, others)).toBeNull();
  });

  it('picks a partner from eligible opponents', () => {
    const candidate = { userId: 'a', joinedAt: 1000 };
    const others = [
      { userId: 'b', joinedAt: 2000 },
      { userId: 'c', joinedAt: 3000 },
    ];
    const partner = findPartner(candidate, others);
    expect(partner).not.toBeNull();
    expect(['b', 'c']).toContain(partner?.userId);
  });

  it('can pair any opponent regardless of wait time', () => {
    const seen = new Set<string>();
    const candidate = { userId: 'a', joinedAt: 1000 };
    const others = [
      { userId: 'b', joinedAt: 2000 },
      { userId: 'c', joinedAt: 3000 },
      { userId: 'd', joinedAt: 4000 },
    ];
    for (let i = 0; i < 30; i++) {
      const partner = findPartner(candidate, others);
      if (partner) seen.add(partner.userId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
