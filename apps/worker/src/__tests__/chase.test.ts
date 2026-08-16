import { describe, expect, it } from '@jest/globals';
import {
  initialScoresForChase,
  resolveAbandonedMatch,
  resolveChaseOnPair,
  resolveMatchOutcome,
} from '@vr-tournament/shared';

const P1 = 'p1';
const P2 = 'p2';

describe('chase setup at pairing', () => {
  it('puts the setter on the board and leaves the chaser to bat', () => {
    // p1 played the solo innings, so p2 chases it.
    const chase = resolveChaseOnPair(P1, P2, { userId: P1, target: 55, playedAt: 1000 }, null);
    expect(chase).toMatchObject({ chaseTarget: 55, chasePlayerId: P2 });

    expect(initialScoresForChase(P1, chase)).toEqual({ player1Score: 55, player2Score: null });
  });

  it('seeds the setter half whichever side of the match they are on', () => {
    const chase = resolveChaseOnPair(P1, P2, null, { userId: P2, target: 41, playedAt: 1000 });
    expect(chase).toMatchObject({ chaseTarget: 41, chasePlayerId: P1 });

    expect(initialScoresForChase(P1, chase)).toEqual({ player1Score: null, player2Score: 41 });
  });

  it('leaves both halves empty in standard mode', () => {
    const chase = resolveChaseOnPair(P1, P2, null, null);
    expect(initialScoresForChase(P1, chase)).toEqual({ player1Score: null, player2Score: null });
  });

  it('seeds the earlier innings when both players played solo', () => {
    const chase = resolveChaseOnPair(
      P1,
      P2,
      { userId: P1, target: 55, playedAt: 1000 },
      { userId: P2, target: 60, playedAt: 2000 }
    );
    // The earlier target is the one being chased, so it is the score on the
    // board; the later player's own solo target does not carry into the match.
    expect(chase).toMatchObject({ chaseTarget: 55, chasePlayerId: P2 });
    expect(initialScoresForChase(P1, chase)).toEqual({ player1Score: 55, player2Score: null });
  });
});

describe('a match that runs out of time', () => {
  it('gives it to the player who batted when the other never showed', () => {
    // The shape a chase leaves behind: the setter's innings on the board, the
    // chaser's half still empty when the round or slot closes.
    expect(resolveAbandonedMatch(55, null)).toBe('player1_walkover');
    expect(resolveAbandonedMatch(null, 55)).toBe('player2_walkover');
  });

  it('counts a score of zero as an innings played', () => {
    expect(resolveAbandonedMatch(0, null)).toBe('player1_walkover');
    expect(resolveAbandonedMatch(null, 0)).toBe('player2_walkover');
  });

  it('abandons a match nobody played', () => {
    expect(resolveAbandonedMatch(null, null)).toBe('abandoned');
    expect(resolveAbandonedMatch(undefined, undefined)).toBe('abandoned');
  });

  it('leaves a complete scoreline alone — that resolves normally, not here', () => {
    expect(resolveAbandonedMatch(55, 60)).toBe('abandoned');
  });
});

describe('chase resolution from the seeded scoreline', () => {
  const chase = { chaseTarget: 55, chasePlayerId: P2 };

  it('resolves on the chaser passing the target', () => {
    // 55 is the setter's seeded score; only the 56 was submitted.
    expect(resolveMatchOutcome(P1, P2, 55, 56, chase)).toBe('player2_win');
  });

  it('gives it to the setter when the chase falls short', () => {
    expect(resolveMatchOutcome(P1, P2, 55, 54, chase)).toBe('player1_win');
  });

  it('calls a rematch when the chaser only levels the target', () => {
    expect(resolveMatchOutcome(P1, P2, 55, 55, chase)).toBe('rematch');
  });
});
