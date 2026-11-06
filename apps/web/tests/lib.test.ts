// Run: pnpm --filter @vr-tournament/web test (node's built-in runner + type stripping).
process.env.TZ = 'Asia/Karachi';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centsToDollars,
  dollarsToCents,
  formatDuration,
  formatDateTime,
  formatMoneyCents,
  toDateTimeLocal,
  toLocalDateKey,
  formatDateTimeRange,
} from '../src/lib/format.ts';
import { sanitizeReturnTo, postLoginPath } from '../src/lib/return-to.ts';
import { passwordRuleError, passwordStrengthScore } from '../src/lib/password-strength.ts';
import { matchCardState } from '../src/lib/match-card-state.ts';
import { notificationLink } from '../src/lib/notification-link.ts';
import { canEnterTournament } from '../src/lib/tournament-play.ts';
import {
  adminSlotGenerationFormSchema,
  MAX_SLOT_GENERATION_DAYS,
  MAX_SLOTS_PER_REQUEST,
  SLOT_GENERATION_HOURS_PER_DAY,
  validateAdminForm,
} from '@vr-tournament/shared';

test('formatDateTime: day before month, no seconds, local zone', () => {
  const year = new Date().getFullYear();
  // 14:00Z = 19:00 PKT
  const iso = new Date(Date.UTC(year, 10, 6, 14, 0, 0)).toISOString();
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Karachi' }).format(new Date(iso));
  assert.equal(formatDateTime(iso), `${weekday} 6 Nov, 7:00 PM`);
  assert.match(formatDateTime(new Date(Date.UTC(year + 1, 0, 2, 4, 5))), new RegExp(`2 Jan ${year + 1}, 9:05 AM$`));
  assert.equal(formatDateTime('garbage'), '—');
});

test('formatDateTimeRange collapses same-day ranges', () => {
  const a = new Date(2030, 0, 2, 19, 0);
  const b = new Date(2030, 0, 2, 20, 0);
  assert.equal(formatDateTimeRange(a, b), 'Wed 2 Jan 2030, 7:00 PM – 8:00 PM');
});

test('toDateTimeLocal round-trips without shifting (C3)', () => {
  const iso = '2026-11-20T14:30:00.000Z';
  const local = toDateTimeLocal(iso);
  assert.equal(local, '2026-11-20T19:30');
  assert.equal(new Date(local).toISOString(), iso);
  assert.equal(toDateTimeLocal(null), '');
});

test('toLocalDateKey uses the local day, not UTC', () => {
  // 01:00 PKT on the 7th is still the 6th in UTC.
  assert.equal(toLocalDateKey(new Date('2026-11-06T20:00:00Z')), '2026-11-07');
});

test('formatMoneyCents', () => {
  assert.equal(formatMoneyCents(500), '$5.00');
  assert.equal(formatMoneyCents(123456), '$1,234.56');
  assert.equal(formatMoneyCents(null), '—');
});

test('sanitizeReturnTo only allows same-origin paths', () => {
  assert.equal(sanitizeReturnTo('/admin'), '/admin');
  assert.equal(sanitizeReturnTo('/tournaments/1?tab=a#x'), '/tournaments/1?tab=a#x');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, '/\tevil', 'admin']) {
    assert.equal(sanitizeReturnTo(bad as string | null), null, String(bad));
  }
  assert.equal(postLoginPath('/login', false), '/venues');
  assert.equal(postLoginPath(null, true), '/admin');
  assert.equal(postLoginPath('//evil.com', true), '/admin');
  assert.equal(postLoginPath('/matches', true), '/matches');
});

test('password rule: 8–128 chars, a letter and a number', () => {
  assert.equal(passwordRuleError('abcd1234'), null);
  assert.ok(passwordRuleError('12345678'));
  assert.ok(passwordRuleError('abcdefgh'));
  assert.ok(passwordRuleError('abc123'));
  assert.ok(passwordRuleError('a1'.repeat(65)));
  assert.equal(passwordRuleError('a1'.repeat(64)), null);
  assert.ok(passwordStrengthScore('12345678') < 3);
  assert.equal(passwordStrengthScore('abcd1234'), 3);
  assert.equal(passwordStrengthScore('abcd1234!'), 4);
});

test('matchCardState gives one state per situation (M4)', () => {
  const base = { myId: 'me', chasePlayerId: null };
  assert.equal(matchCardState({ ...base, status: 'pending_confirmation', myScore: null, opponentScore: null }), 'not_started');
  assert.equal(matchCardState({ ...base, status: 'confirmed', myScore: null, opponentScore: null }), 'bat_first');
  assert.equal(matchCardState({ ...base, status: 'in_progress', myScore: null, opponentScore: 40 }), 'chasing');
  assert.equal(matchCardState({ ...base, status: 'in_progress', myScore: 40, opponentScore: null }), 'waiting_opponent');
  assert.equal(matchCardState({ ...base, status: 'in_progress', myScore: 40, opponentScore: 41 }), 'resolving');
  assert.equal(matchCardState({ ...base, status: 'completed', myScore: 40, opponentScore: 41 }), 'completed');
  assert.equal(matchCardState({ myId: 'me', chasePlayerId: 'me', status: 'in_progress', myScore: null, opponentScore: null }), 'chasing');
});

test('dollars <-> cents for the buyback price input', () => {
  assert.equal(dollarsToCents('2.50'), 250);
  assert.equal(dollarsToCents('2.55'), 255);
  assert.equal(dollarsToCents(' 5 '), 500);
  assert.equal(dollarsToCents('.5'), 50);
  assert.equal(dollarsToCents('0'), 0);
  for (const bad of ['', '-1', 'abc', '2.555', '1,000', '$2']) assert.equal(dollarsToCents(bad), null, bad);
  assert.equal(centsToDollars(250), '2.50');
  assert.equal(centsToDollars(500), '5.00');
});

test('formatDuration is human, not raw seconds', () => {
  assert.equal(formatDuration(4692), '1 h 18 m');
  assert.equal(formatDuration(42), '42 s');
  assert.equal(formatDuration(600), '10 m');
  assert.equal(formatDuration(90_000), '1 d 1 h');
  assert.equal(formatDuration(-5), '0 s');
});

test('notificationLink: own link first, then a route by type', () => {
  assert.equal(notificationLink({ type: 'match_found', payload: { link: '/matches/abc' } }), '/matches/abc');
  assert.equal(notificationLink({ type: 'match_found', payload: { link: 'https://evil.com' } }), '/matches');
  assert.equal(notificationLink({ type: 'match_won', payload: {} }), '/matches');
  assert.equal(notificationLink({ type: 'opponent_withdrew_requeued', payload: null }), '/matches');
  assert.equal(notificationLink({ type: 'tournament_live', payload: { tournamentId: 't1' } }), '/tournaments/t1');
  assert.equal(notificationLink({ type: 'tournament_registered', payload: {} }), '/tournaments');
  assert.equal(notificationLink({ type: 'booking_confirmed', payload: {} }), '/bookings');
  assert.equal(notificationLink({ type: 'announcement', payload: {} }), null);
});

test('canEnterTournament mirrors the API /enter rule', () => {
  assert.equal(canEnterTournament('open', null), true);
  assert.equal(canEnterTournament('in_progress', 'advanced'), true);
  assert.equal(canEnterTournament('completed', 'active'), false);
  assert.equal(canEnterTournament('closed', 'active'), false);
  assert.equal(canEnterTournament('in_progress', 'eliminated'), false);
  assert.equal(canEnterTournament('in_progress', 'out'), false);
});

test('slot generation form needs only the two dates (E2E #1)', () => {
  assert.ok(validateAdminForm(adminSlotGenerationFormSchema, { startDate: '2026-11-10', endDate: '2026-11-10' }).ok);
  const backwards = validateAdminForm(adminSlotGenerationFormSchema, { startDate: '2026-11-10', endDate: '2026-11-09' });
  assert.ok(!backwards.ok && backwards.errors.endDate);
  const blank = validateAdminForm(adminSlotGenerationFormSchema, { startDate: '', endDate: '' });
  assert.ok(!blank.ok && blank.errors.startDate && blank.errors.endDate);
  // The cap keeps one run under the API's per-request slot limit.
  assert.ok(MAX_SLOT_GENERATION_DAYS * SLOT_GENERATION_HOURS_PER_DAY <= MAX_SLOTS_PER_REQUEST);
  assert.equal(MAX_SLOT_GENERATION_DAYS, 20);
  assert.ok(validateAdminForm(adminSlotGenerationFormSchema, { startDate: '2026-11-01', endDate: '2026-11-20' }).ok);
  const tooLong = validateAdminForm(adminSlotGenerationFormSchema, { startDate: '2026-11-01', endDate: '2026-11-30' });
  assert.ok(!tooLong.ok && tooLong.errors.endDate);
});
