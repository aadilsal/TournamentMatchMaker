import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_RATING_POINTS,
  applyMatchResult,
  drawLostNotice,
  drawWonNotice,
  nextTierFor,
  pointsToTier,
  tierAfterResult,
} from '@vr-tournament/shared';

describe('rating rules', () => {
  it('starts new players in Tier 1 at 300 points', () => {
    expect(DEFAULT_RATING_POINTS).toBe(300);
    expect(pointsToTier(DEFAULT_RATING_POINTS)).toBe(1);
  });

  it('adds 30 for a win and takes 18 for a loss, never below 0', () => {
    expect(applyMatchResult(300, true)).toBe(330);
    expect(applyMatchResult(300, false)).toBe(282);
    expect(applyMatchResult(10, false)).toBe(0);
  });

  it('promotes when points cross a tier line', () => {
    expect(tierAfterResult(1, 510)).toBe(2);
  });

  it('keeps a reached tier when a loss drops points below its floor', () => {
    expect(tierAfterResult(2, applyMatchResult(505, false))).toBe(2);
  });

  it('counts the next tier from the tier held, not from points', () => {
    expect(nextTierFor(2, 487)).toEqual({ tier: 3, pointsNeeded: 313 });
    expect(nextTierFor(5, 2000)).toBeNull();
  });
});

describe('result messages show the points change', () => {
  const common = { tournamentName: 'Lahore Open', roundLabel: 'Round 1', walkover: false };

  it('tells the winner what they gained', () => {
    const n = drawWonNotice({ ...common, opponent: 'zara', myScore: 40, opponentScore: 30, isFinal: false, nextDrawAt: null, points: { change: 30, ratingPoints: 330 } });
    expect(n.message).toContain('+30 points (330 total)');
  });

  it('tells the loser what they lost', () => {
    const n = drawLostNotice({ ...common, opponent: 'zara', myScore: 30, opponentScore: 40, buyback: null, points: { change: -18, ratingPoints: 282 } });
    expect(n.message).toContain('−18 points (282 total)');
  });

  it('says nothing about points when the match was not rated', () => {
    const n = drawLostNotice({ ...common, opponent: 'bot', myScore: 30, opponentScore: 40, buyback: null });
    expect(n.message).not.toContain('points');
  });
});
