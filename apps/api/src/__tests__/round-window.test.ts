import { describe, expect, it } from '@jest/globals';
import { roundWindowViolation, roundsOutsideWindow } from '@vr-tournament/shared';

const TOURNAMENT = {
  startDate: '2026-08-22T16:36:00Z',
  endDate: '2026-08-23T16:36:00Z',
};

describe('round window', () => {
  it('accepts a round inside the tournament', () => {
    expect(
      roundWindowViolation(
        { startsAt: '2026-08-22T16:43:00Z', endsAt: '2026-08-22T16:48:00Z' },
        TOURNAMENT
      )
    ).toBeNull();
  });

  it('treats the tournament bounds as inclusive', () => {
    expect(
      roundWindowViolation(
        { startsAt: TOURNAMENT.startDate, endsAt: TOURNAMENT.endDate },
        TOURNAMENT
      )
    ).toBeNull();
  });

  it('rejects a round that starts before the tournament', () => {
    const violation = roundWindowViolation(
      { startsAt: '2026-08-22T10:00:00Z', endsAt: '2026-08-22T18:00:00Z' },
      TOURNAMENT
    );
    expect(violation?.path).toBe('startsAt');
    expect(violation?.limit.toISOString()).toBe('2026-08-22T16:36:00.000Z');
  });

  // The case that reached production: `close-round` opens round N+1 at the
  // previous round's end plus a full round length, with nothing checking that
  // against the tournament's own end date.
  it('rejects a round that runs past the tournament end', () => {
    const violation = roundWindowViolation(
      { startsAt: '2026-08-22T16:48:00Z', endsAt: '2026-08-23T16:48:00Z' },
      TOURNAMENT
    );
    expect(violation?.path).toBe('endsAt');
    expect(violation?.limit.toISOString()).toBe('2026-08-23T16:36:00.000Z');
  });

  it('names every round left outside a moved window', () => {
    const outside = roundsOutsideWindow(
      [
        { roundNumber: 1, startsAt: '2026-08-22T16:36:00Z', endsAt: '2026-08-23T16:36:00Z' },
        { roundNumber: 2, startsAt: '2026-08-22T16:43:00Z', endsAt: '2026-08-22T16:48:00Z' },
        { roundNumber: 3, startsAt: '2026-08-22T16:48:00Z', endsAt: '2026-08-23T16:48:00Z' },
      ],
      TOURNAMENT
    );
    expect(outside.map((o) => o.round.roundNumber)).toEqual([3]);
  });

  it('accepts dates that widen the tournament around its rounds', () => {
    const outside = roundsOutsideWindow(
      [{ roundNumber: 3, startsAt: '2026-08-22T16:48:00Z', endsAt: '2026-08-23T16:48:00Z' }],
      { startDate: '2026-08-22T16:36:00Z', endDate: '2026-08-24T00:00:00Z' }
    );
    expect(outside).toHaveLength(0);
  });
});
