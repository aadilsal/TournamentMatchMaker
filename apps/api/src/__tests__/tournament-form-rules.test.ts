import { describe, expect, it } from '@jest/globals';
import { adminTournamentFormSchema, validateAdminForm } from '@vr-tournament/shared';

/** A form that passes, so each case below changes exactly one thing. */
const VALID = {
  name: 'testRound',
  game: 'VR Cricket',
  registrationOpensAt: '2026-08-21T12:49',
  registrationClosesAt: '2026-08-23T12:49',
  startDate: '2026-08-24T12:49',
  endDate: '2026-08-28T12:49',
  status: 'draft' as const,
  maxPlayers: '',
  skillTier: '3',
  buybackPriceCents: '500',
  roundDurationDays: '2',
};

function errorsFor(overrides: Partial<typeof VALID>) {
  const result = validateAdminForm(adminTournamentFormSchema, { ...VALID, ...overrides });
  return result.ok ? {} : result.errors;
}

describe('tournament form rules', () => {
  it('accepts a window that fits both normal rounds', () => {
    expect(errorsFor({})).toEqual({});
  });

  it('rejects a 2-day round in a 24-hour tournament', () => {
    const errors = errorsFor({ endDate: '2026-08-25T12:49' });
    expect(errors.roundDurationDays).toContain('need 4 days of tournament');
  });

  it('offers the shorter round only when one would fit', () => {
    // 4-day window, 3-day rounds: two rounds need 6 days, but a 2-day round fits.
    expect(errorsFor({ roundDurationDays: '3' }).roundDurationDays).toContain(
      'Shorten the round to 2 days'
    );
    // 1-day window: no legal round fits, so extending is the only way out.
    expect(errorsFor({ endDate: '2026-08-25T12:49' }).roundDurationDays).toContain(
      'Move the end date'
    );
  });

  it('accepts a window that is exactly the rounds it must hold', () => {
    expect(errorsFor({ endDate: '2026-08-28T12:49', roundDurationDays: '2' })).toEqual({});
  });

  it('rejects a start and end on the same calendar day', () => {
    const errors = errorsFor({
      startDate: '2026-08-24T09:00',
      endDate: '2026-08-24T23:00',
      roundDurationDays: '1',
    });
    expect(errors.endDate).toBe('End date must be on a later day than the start date');
  });

  it('still rejects an end before the start', () => {
    const errors = errorsFor({ endDate: '2026-08-20T12:49' });
    expect(errors.endDate).toBe('End date must be after start date');
  });

  it('rejects a round duration that is not whole days', () => {
    expect(errorsFor({ roundDurationDays: '0' }).roundDurationDays).toBeTruthy();
    expect(errorsFor({ roundDurationDays: '' }).roundDurationDays).toBeTruthy();
  });
});
