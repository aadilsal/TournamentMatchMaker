import { describe, expect, it } from '@jest/globals';
import {
  knockoutThreshold,
  playersToAdvance,
  shouldStartKnockout,
} from '@vr-tournament/shared';

describe('round advancement', () => {
  it('uses half the field as knockout threshold', () => {
    expect(knockoutThreshold(100)).toBe(50);
    expect(knockoutThreshold(17)).toBe(8);
  });

  it('advances half until knockout threshold', () => {
    expect(playersToAdvance(100, 100)).toBe(50);
    expect(playersToAdvance(80, 100)).toBe(40);
  });

  it('starts knockout at half the field or fewer', () => {
    expect(shouldStartKnockout(50, 100)).toBe(true);
    expect(shouldStartKnockout(51, 100)).toBe(false);
    expect(shouldStartKnockout(8, 17)).toBe(true);
  });
});
