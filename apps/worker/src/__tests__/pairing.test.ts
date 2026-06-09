import { describe, expect, it } from '@jest/globals';
import { canPair, findPartner, skillWindow } from '../lib/pairing.js';

describe('pairing algorithm', () => {
  it('uses tier 1 window initially', () => {
    expect(skillWindow(10)).toBe(1);
  });

  it('expands to tier 2 after 30s', () => {
    expect(skillWindow(35)).toBe(2);
  });

  it('force pairs after 90s', () => {
    expect(skillWindow(95)).toBe(99);
  });

  it('pairs within skill window', () => {
    const candidate = { userId: 'a', skillTier: 3, joinedAt: 1000 };
    const others = [
      { userId: 'b', skillTier: 4, joinedAt: 2000 },
      { userId: 'c', skillTier: 1, joinedAt: 3000 },
    ];
    expect(findPartner(candidate, others, 10)?.userId).toBe('b');
  });

  it('force pairs any opponent after 90s', () => {
    const candidate = { userId: 'a', skillTier: 1, joinedAt: 1000 };
    const others = [{ userId: 'b', skillTier: 5, joinedAt: 2000 }];
    expect(canPair(candidate, others[0], 95)).toBe(true);
  });
});
