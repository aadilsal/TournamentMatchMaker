import { describe, expect, it } from '@jest/globals';
import { playersToAdvance, shouldStartKnockout } from '@vr-tournament/shared';

describe('round advancement', () => {
  it('advances half when above 32', () => {
    expect(playersToAdvance(50)).toBe(25);
  });

  it('advances to 16 when between 17 and 32', () => {
    expect(playersToAdvance(25)).toBe(16);
    expect(playersToAdvance(20)).toBe(16);
  });

  it('starts knockout at 16 or fewer', () => {
    expect(shouldStartKnockout(16)).toBe(true);
    expect(shouldStartKnockout(10)).toBe(true);
    expect(shouldStartKnockout(17)).toBe(false);
  });
});
