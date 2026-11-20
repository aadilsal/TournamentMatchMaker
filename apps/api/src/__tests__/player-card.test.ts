import { describe, expect, it } from '@jest/globals';
import {
  drawRound,
  playerGreeting,
  playerStatusText,
  playerTournamentStatus,
  settleDrawMatch,
  type PlayerCardTournament,
} from '@vr-tournament/shared';

const base = { participantStatus: 'active', participantRound: 1, currentRound: 1, isChampion: false };

describe('player standing in a tournament', () => {
  it('is registered before the start', () => {
    expect(playerTournamentStatus({ ...base, tournamentStatus: 'open' })).toBe('registered');
  });

  it('is active while their round is being played', () => {
    expect(playerTournamentStatus({ ...base, tournamentStatus: 'in_progress' })).toBe('active');
  });

  it('is through once they have won this round', () => {
    expect(playerTournamentStatus({ ...base, tournamentStatus: 'in_progress', participantRound: 2 })).toBe('through');
  });

  it('is knocked out after a loss', () => {
    for (const participantStatus of ['eliminated', 'out']) {
      expect(playerTournamentStatus({ ...base, tournamentStatus: 'in_progress', participantStatus })).toBe('knocked_out');
    }
  });

  it('separates the champion from everyone else at the end', () => {
    expect(playerTournamentStatus({ ...base, tournamentStatus: 'completed', isChampion: true })).toBe('champion');
    expect(playerTournamentStatus({ ...base, tournamentStatus: 'completed' })).toBe('finished');
  });
});

describe('status text', () => {
  const common = {
    tournamentName: 'Lahore Open',
    startDate: '2026-11-20T15:00:00Z',
    roundLabel: 'Semi-final',
    roundClosesAt: '2026-11-21T15:00:00Z',
    timeZone: 'UTC',
  };

  it('names the opponent and the deadline when it is their turn', () => {
    const text = playerStatusText({ ...common, status: 'active', opponent: 'zara_vr', matchState: 'your_turn' });
    expect(text).toContain('Semi-final');
    expect(text).toContain('zara_vr');
  });

  it('says who they are waiting for once they have batted', () => {
    const text = playerStatusText({ ...common, status: 'active', opponent: 'zara_vr', matchState: 'waiting_for_opponent' });
    expect(text).toContain('Waiting for zara_vr');
  });

  it('celebrates the champion', () => {
    expect(playerStatusText({ ...common, status: 'champion', opponent: null, matchState: null })).toContain('You won Lahore Open');
  });
});

describe('greeting', () => {
  const t = (overrides: Partial<PlayerCardTournament>): PlayerCardTournament => ({
    id: 't', name: 'T', status: 'live', startDate: '', playingAt: null, myStatus: 'active',
    statusText: '', round: null, match: null, ...overrides,
  });

  it('prompts when a match is waiting', () => {
    const match = { id: 'm', opponent: 'x', state: 'your_turn' as const, myScore: -1, opponentScore: -1 };
    expect(playerGreeting('ali', [t({ match })])).toContain('your match is ready');
  });

  it('is a plain welcome otherwise', () => {
    expect(playerGreeting('ali', [t({})])).toBe('Welcome back, ali!');
  });
});

describe('draw rules', () => {
  it('pairs top seed against bottom and gives an odd field one bot', () => {
    const field = [5, 4, 3, 2, 1].map((r) => ({ userId: `p${r}`, rating: r * 100 }));
    const pairs = drawRound(field, () => 0.5);
    expect(pairs.filter((p) => p.player2Id === null)).toEqual([{ slot: 0, player1Id: 'p1', player2Id: null }]);
    expect(pairs).toContainEqual({ slot: 1, player1Id: 'p5', player2Id: 'p2' });
    expect(pairs).toContainEqual({ slot: 2, player1Id: 'p4', player2Id: 'p3' });
  });

  it('settles every case the rules describe', () => {
    const m = { player1Id: 'a', player2Id: 'b' };
    expect(settleDrawMatch({ ...m, player1Score: 20, player2Score: 15 })).toBe('a');
    expect(settleDrawMatch({ ...m, player1Score: 20, player2Score: 20, firstBatterId: 'b' })).toBe('b');
    expect(settleDrawMatch({ ...m, player1Score: null, player2Score: 9 })).toBe('b');
    expect(settleDrawMatch({ ...m, player1Score: null, player2Score: null })).toBeNull();
    expect(settleDrawMatch({ ...m, player1Score: null, player2Score: null, tiedFirstBatterId: 'a' })).toBe('a');
  });
});
