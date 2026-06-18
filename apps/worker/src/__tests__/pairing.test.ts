import { describe, expect, it } from '@jest/globals';
import { findPartner } from '../lib/pairing.js';

describe('pairing algorithm', () => {
  it('returns null when no other players', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore' };
    expect(findPartner(candidate, [])).toBeNull();
  });

  it('never pairs a player with themselves', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore' };
    const others = [{ userId: 'a', joinedAt: 2000, city: 'Karachi' }];
    expect(findPartner(candidate, others)).toBeNull();
  });

  it('prefers cross-city opponents', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore' };
    const others = [
      { userId: 'b', joinedAt: 2000, city: 'Lahore' },
      { userId: 'c', joinedAt: 3000, city: 'Karachi' },
    ];
    const partner = findPartner(candidate, others);
    expect(partner?.userId).toBe('c');
  });

  it('falls back to same-city when no cross-city option', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore' };
    const others = [{ userId: 'b', joinedAt: 2000, city: 'Lahore' }];
    const partner = findPartner(candidate, others);
    expect(partner?.userId).toBe('b');
  });

  it('picks a partner from eligible opponents', () => {
    const candidate = { userId: 'a', joinedAt: 1000, city: 'Lahore' };
    const others = [
      { userId: 'b', joinedAt: 2000, city: 'Karachi' },
      { userId: 'c', joinedAt: 3000, city: 'Islamabad' },
    ];
    const partner = findPartner(candidate, others);
    expect(partner).not.toBeNull();
    expect(['b', 'c']).toContain(partner?.userId);
  });
});
