import { describe, expect, it } from '@jest/globals';
import {
  BALLS_PER_INNINGS,
  BOT_CHASE_WIN_RATE,
  BOT_MIN_SCORE,
  MATCH_TURN_HOLD_MS,
  botChaseScore,
  botTargetScore,
  chaseTargetFor,
  generateBotInnings,
  generateBotScore,
  isTurnHoldActive,
  pickBotUsername,
  resolveMatchOutcome,
} from '@vr-tournament/shared';

const P1 = 'p1';
const P2 = 'p2';

describe('the chase target shown to the chaser', () => {
  it('is always one more than the opponent scored', () => {
    expect(chaseTargetFor(0)).toBe(1);
    expect(chaseTargetFor(12)).toBe(13);
    expect(chaseTargetFor(55)).toBe(56);
  });

  it('is a number the chaser wins by reaching', () => {
    // The point of the +1: "reach the target" and "win the match" have to be
    // the same instruction. Showing the setter's raw score asked the chaser to
    // reach a number that, on reaching, only levelled — which is a tie, not a
    // win, and sends both players to a rematch instead.
    const setterScore = 20;
    const target = chaseTargetFor(setterScore);
    const chase = { chaseTarget: target, chasePlayerId: P2 };

    expect(resolveMatchOutcome(P1, P2, setterScore, target, chase)).toBe('player2_win');
    expect(resolveMatchOutcome(P1, P2, setterScore, target - 1, chase)).toBe('rematch');
    expect(resolveMatchOutcome(P1, P2, setterScore, target - 2, chase)).toBe('player1_win');
  });

  it('separates a duck from a tie against a duck', () => {
    const chase = { chaseTarget: chaseTargetFor(0), chasePlayerId: P2 };
    // Bowled out for nothing still has to be beaten. Matching it is a tie.
    expect(resolveMatchOutcome(P1, P2, 0, 0, chase)).toBe('rematch');
    expect(resolveMatchOutcome(P1, P2, 0, 1, chase)).toBe('player2_win');
  });
});

describe('the bot innings', () => {
  it('never falls below the floor that makes it worth batting against', () => {
    // Six dot balls is a legal over but not a contest — the player would win
    // by pushing a single.
    const allDots = () => 0;
    expect(generateBotScore(allDots)).toBe(BOT_MIN_SCORE);
  });

  it('cannot exceed six maximums', () => {
    const allSixes = () => 0.999999;
    expect(generateBotScore(allSixes)).toBe(6 * BALLS_PER_INNINGS);
  });

  it('stays inside a believable range across many innings', () => {
    const scores = Array.from({ length: 2000 }, () => generateBotScore());
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(BOT_MIN_SCORE);
      expect(score).toBeLessThanOrEqual(6 * BALLS_PER_INNINGS);
    }

    // Weighted to read like a real over rather than a uniform roll: the average
    // should land in the low-to-mid teens, the range players actually put up.
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThan(9);
    expect(mean).toBeLessThan(18);
  });

  it('is varied enough that a player cannot learn one number', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateBotScore()));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('is chaseable sometimes and out of reach others', () => {
    const scores = Array.from({ length: 1000 }, () => generateBotScore());
    // Both outcomes have to be live, or the bot is either a free win or an
    // automatic loss rather than an opponent.
    expect(scores.some((s) => s <= 12)).toBe(true);
    expect(scores.some((s) => s >= 20)).toBe(true);
  });
});

describe('the bot reacting to the player', () => {
  it('never ties a chase, so every bot match has a winner', () => {
    for (const human of [0, 1, 5, 13, 22, 36, 47, 120]) {
      for (let i = 0; i < 300; i++) expect(botChaseScore(human)).not.toBe(human);
    }
  });

  it('finishes close to the human score', () => {
    for (let i = 0; i < 2000; i++) {
      const bot = botChaseScore(20);
      expect(Math.abs(bot - 20)).toBeLessThanOrEqual(6);
      expect(bot).toBeGreaterThanOrEqual(0);
    }
  });

  it('wins roughly the configured share of chases', () => {
    const runs = 5000;
    const wins = Array.from({ length: runs }, () => botChaseScore(18)).filter((s) => s > 18).length;
    expect(wins / runs).toBeGreaterThan(BOT_CHASE_WIN_RATE - 0.05);
    expect(wins / runs).toBeLessThan(BOT_CHASE_WIN_RATE + 0.05);
  });

  it('cannot lose to a duck', () => {
    for (let i = 0; i < 200; i++) expect(botChaseScore(0)).toBeGreaterThan(0);
  });

  it('sets a target near the player recent form', () => {
    for (let i = 0; i < 1000; i++) {
      const target = botTargetScore([30, 28, 32, 30, 30]);
      expect(target).toBeGreaterThanOrEqual(24);
      expect(target).toBeLessThanOrEqual(36);
    }
  });

  it('only uses the latest innings for form', () => {
    const target = botTargetScore([10, 10, 10, 10, 10, 500, 500], () => 0.5);
    expect(target).toBe(10);
  });

  it('falls back to six balls for a player with no history', () => {
    const target = botTargetScore([], () => 0.999999);
    expect(target).toBe(6 * BALLS_PER_INNINGS);
  });

  it('chases when the human has batted, otherwise sets a target', () => {
    expect(generateBotInnings({ opponentScore: 15 }, () => 0)).toBeGreaterThan(15);
    expect(generateBotInnings({ recentScores: [20] }, () => 0.5)).toBe(20);
  });
});

describe('bot usernames', () => {
  it('never collides with a name already in use', () => {
    const taken = new Set(['ravi_mehta', 'jordan_blake']);
    for (let i = 0; i < 50; i++) {
      expect(taken.has(pickBotUsername(taken))).toBe(false);
    }
  });

  it('keeps producing names after the pool is exhausted', () => {
    // A long-lived deployment runs more tournaments than there are names, and
    // running out would leave the odd player out with no opponent at all.
    const taken = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const name = pickBotUsername(taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
    expect(taken.size).toBe(120);
  });

  it('reads like a handle a person would pick', () => {
    const name = pickBotUsername(new Set());
    expect(name).toMatch(/^[a-z]+_[a-z]+\d*$/);
    expect(name).not.toMatch(/bot|cpu|ai|computer/i);
  });
});

describe('the match turn lock', () => {
  const now = 1_700_000_000_000;

  it('holds while the grant is fresh', () => {
    expect(isTurnHoldActive(P1, new Date(now - 60_000), now)).toBe(true);
  });

  it('lapses once the hold has run its course', () => {
    // Without this a player who claims the match and walks away locks their
    // opponent out until the round closes.
    expect(isTurnHoldActive(P1, new Date(now - MATCH_TURN_HOLD_MS - 1), now)).toBe(false);
  });

  it('treats an unheld match as claimable', () => {
    expect(isTurnHoldActive(null, null, now)).toBe(false);
    expect(isTurnHoldActive(null, new Date(now), now)).toBe(false);
  });

  it('treats a hold with no timestamp as lapsed, not eternal', () => {
    // The only way to get one is a partial write, and the safe reading of "we
    // do not know when this started" is to let the other player take it.
    expect(isTurnHoldActive(P1, null, now)).toBe(false);
    expect(isTurnHoldActive(P1, 'not-a-date', now)).toBe(false);
  });

  it('accepts the timestamp in either shape the driver returns', () => {
    expect(isTurnHoldActive(P1, new Date(now - 1000).toISOString(), now)).toBe(true);
    expect(isTurnHoldActive(P1, new Date(now - 1000), now)).toBe(true);
  });
});
