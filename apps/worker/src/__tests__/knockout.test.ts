import { describe, expect, it } from '@jest/globals';
import { KNOCKOUT_ROUNDS, knockoutDraw } from '@vr-tournament/shared';

const field = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('knockout draw', () => {
  it('pairs an even field with nobody left out', () => {
    const { pairs, bye } = knockoutDraw(field(4));
    expect(bye).toBeNull();
    expect(pairs).toEqual([
      ['p0', 'p1'],
      ['p2', 'p3'],
    ]);
  });

  it('gives the odd player out a bye rather than dropping them', () => {
    // The case that deadlocked the bracket: three players, one match, and a
    // third player with no match and no path to one.
    const { pairs, bye } = knockoutDraw(field(3));
    expect(bye).toBe('p0');
    expect(pairs).toEqual([['p1', 'p2']]);
  });

  it('gives the bye to the best record — the list arrives seeded', () => {
    const { bye } = knockoutDraw(['best', 'second', 'third', 'fourth', 'fifth']);
    expect(bye).toBe('best');
  });

  it('names the round from how many are left', () => {
    expect(knockoutDraw(field(9)).roundNumber).toBe(KNOCKOUT_ROUNDS.ro16);
    expect(knockoutDraw(field(8)).roundNumber).toBe(KNOCKOUT_ROUNDS.qf);
    expect(knockoutDraw(field(4)).roundNumber).toBe(KNOCKOUT_ROUNDS.sf);
    expect(knockoutDraw(field(2)).roundNumber).toBe(KNOCKOUT_ROUNDS.final);
  });

  it('every player in the draw is either playing or on the bye', () => {
    for (let n = 2; n <= 32; n++) {
      const { pairs, bye } = knockoutDraw(field(n));
      const drawn = new Set([...pairs.flat(), ...(bye ? [bye] : [])]);
      expect(drawn.size).toBe(n);
    }
  });

  // The sweep re-draws from whoever is left, so the bracket has to shrink to a
  // single champion from any starting size — an odd field must never stall.
  it('converges to one champion from any field size', () => {
    for (let n = 2; n <= 40; n++) {
      let remaining = field(n);
      let rounds = 0;
      while (remaining.length > 1) {
        const { pairs, bye } = knockoutDraw(remaining);
        expect(pairs.length).toBeGreaterThan(0);
        // Winners advance; the bye carries through untouched.
        remaining = [...(bye ? [bye] : []), ...pairs.map(([p1]) => p1)];
        rounds++;
        expect(rounds).toBeLessThan(n + 2);
      }
      expect(remaining).toHaveLength(1);
    }
  });
});
