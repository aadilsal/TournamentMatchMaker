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

  it('calls a rematch when the chaser only levels the score', () => {
    // A tie is replayed as a new match, not settled in this one. That does not
    // reopen this match to either player: the innings record is per match, so
    // both get a clean innings in whatever they are paired into next, and
    // neither may ever bat twice here.
    expect(resolveMatchOutcome(P1, P2, 55, 55, chase)).toBe('rematch');
  });

  it('calls a rematch on a level score whichever side the chaser bats on', () => {
    const p1Chases = { chaseTarget: 55, chasePlayerId: P1 };
    expect(resolveMatchOutcome(P1, P2, 55, 55, p1Chases)).toBe('rematch');
  });

  it('decides every unequal scoreline and ties the rest', () => {
    for (const [a, b] of [[3, 99], [99, 3], [56, 55]]) {
      expect(['player1_win', 'player2_win']).toContain(
        resolveMatchOutcome(P1, P2, a, b, chase)
      );
    }
    for (const [a, b] of [[0, 0], [55, 55], [12, 12]]) {
      expect(resolveMatchOutcome(P1, P2, a, b, chase)).toBe('rematch');
    }
  });

  it('gives the win to the setter on the innings shown, not a stale target', () => {
    // The scoreline and `chaseTarget` agree everywhere the pairing code puts
    // them, so this is what a correction to the setter's innings must not be
    // able to do: 56 once beat a target frozen at 55 while the board read 60,
    // handing the chaser a match they lost by four runs.
    expect(resolveMatchOutcome(P1, P2, 60, 56, { chaseTarget: 55, chasePlayerId: P2 })).toBe(
      'player1_win'
    );
  });

  it('resolves the same when the chaser bats as player 1', () => {
    const p1Chases = { chaseTarget: 55, chasePlayerId: P1 };
    expect(resolveMatchOutcome(P1, P2, 56, 55, p1Chases)).toBe('player1_win');
    expect(resolveMatchOutcome(P1, P2, 54, 55, p1Chases)).toBe('player2_win');
  });
});
