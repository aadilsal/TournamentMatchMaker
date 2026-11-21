import { describe, expect, it } from '@jest/globals';
import {
  ballsPerInnings,
  botTargetScore,
  generateBotScore,
  isTurnHoldActive,
  normalizeOvers,
  oversLabel,
  scaleScoreToOvers,
  turnHoldMsForOvers,
} from '@vr-tournament/shared';

// Overs per tournament: bot innings, the turn hold and labels all follow the overs.

const MIN = 60 * 1000;
const allDots = () => 0;

describe('overs helpers', () => {
  it('counts balls and labels the format', () => {
    expect(ballsPerInnings(1)).toBe(6);
    expect(ballsPerInnings(20)).toBe(120);
    expect(oversLabel(1)).toBe('1 over a side');
    expect(oversLabel(5)).toBe('5 overs a side');
  });

  it('treats missing or out-of-range overs as legal values', () => {
    expect(normalizeOvers(null)).toBe(1);
    expect(normalizeOvers(0)).toBe(1);
    expect(normalizeOvers(99)).toBe(20);
  });

  it('compares form at the same run rate', () => {
    expect(scaleScoreToOvers(12, 1, 5)).toBe(60);
    expect(scaleScoreToOvers(60, 5, 1)).toBe(12);
  });
});

describe('bot innings follow the overs', () => {
  it('bats a full innings and keeps a per-over floor', () => {
    expect(generateBotScore(allDots, 1)).toBe(5);
    expect(generateBotScore(allDots, 5)).toBe(25);
    expect(generateBotScore(() => 0.999, 10)).toBeGreaterThan(generateBotScore(() => 0.999, 1));
  });

  it('sets a target with no history at the tournament length', () => {
    expect(botTargetScore([], allDots, 5)).toBe(25);
  });
});

describe('turn hold grows with the innings', () => {
  it('is 10 minutes for one over and 4 more per extra over', () => {
    expect(turnHoldMsForOvers(1)).toBe(10 * MIN);
    expect(turnHoldMsForOvers(5)).toBe(26 * MIN);
    expect(turnHoldMsForOvers(20)).toBe(86 * MIN);
  });

  it('keeps a long innings held past the one-over limit', () => {
    const since = new Date(Date.now() - 20 * MIN);
    expect(isTurnHoldActive('p1', since)).toBe(false);
    expect(isTurnHoldActive('p1', since, Date.now(), turnHoldMsForOvers(5))).toBe(true);
  });
});
