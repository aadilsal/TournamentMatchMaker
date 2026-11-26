import { describe, expect, it } from '@jest/globals';
import { battingLeaderboards, battingTotals, type InningsRow } from '@vr-tournament/shared';

// The wickets board ranks wickets per over, with a minimum number of innings, so short careers and short formats cannot win it.

const inn = (userId: string, wicketsLost: number | null, overs = 1, score = 20): InningsRow => ({
  userId, username: userId, score, fours: null, sixes: null, wicketsLost, overs,
});

describe('fewest wickets per over', () => {
  it('leaves out players below the minimum innings', () => {
    const rows = [inn('one-hit', 0), inn('regular', 1), inn('regular', 0), inn('regular', 1)];
    expect(battingLeaderboards(rows, 5, 3).fewestWicketsPerOver.map((e) => e.userId)).toEqual(['regular']);
  });

  it('compares formats fairly: 2 wickets in 20 overs beats 1 wicket in 1 over', () => {
    const rows = [
      ...[0, 1, 1].map((w) => inn('t20', w, 20)),
      ...[1, 1, 1].map((w) => inn('super-over', w, 1)),
    ];
    const board = battingLeaderboards(rows, 5, 3).fewestWicketsPerOver;
    expect(board.map((e) => e.userId)).toEqual(['t20', 'super-over']);
    expect(board[0]).toMatchObject({ value: 0.03, wickets: 2, overs: 60 });
    expect(board[1]).toMatchObject({ value: 1, wickets: 3, overs: 3 });
  });

  it('breaks level rates by more overs batted', () => {
    const rows = [...[0, 0, 0].map(() => inn('short', 0, 1)), ...[0, 0, 0].map(() => inn('long', 0, 5))];
    expect(battingLeaderboards(rows, 5, 3).fewestWicketsPerOver.map((e) => e.userId)).toEqual(['long', 'short']);
  });

  it('reports the career rate only over innings that sent wickets', () => {
    expect(battingTotals([inn('p', 2, 5), inn('p', null, 5)])).toMatchObject({ wicketInnings: 1, wicketOvers: 5, wicketsPerOver: 0.4 });
  });
});
