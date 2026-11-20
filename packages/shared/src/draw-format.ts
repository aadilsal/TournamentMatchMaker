/** Draw-format tournaments: every round is one knockout match per player, drawn at round start. */

import type { RandomSource } from './bot-player.js';

export type PlayFormat = 'classic' | 'draw';

/** Tournaments and matches in the draw format carry this phase. */
export const DRAW_PHASE = 'draw';

export interface DrawEntrant {
  userId: string;
  rating: number;
}

/** One match of a draw; `player2Id` null means the tournament bot takes the seat. */
export interface DrawPairing {
  slot: number;
  player1Id: string;
  player2Id: string | null;
}

/** Highest rating first; equal ratings in random order. */
export function seedEntrants(entrants: readonly DrawEntrant[], random: RandomSource = Math.random): string[] {
  return entrants
    .map((e) => ({ ...e, tieBreak: random() }))
    .sort((a, b) => b.rating - a.rating || a.tieBreak - b.tieBreak)
    .map((e) => e.userId);
}

/** Pair a seeded field: top meets bottom; an odd field gives the lowest seed the bot. */
export function pairSeeded(seededIds: readonly string[]): DrawPairing[] {
  const ids = [...new Set(seededIds)];
  const pairings: DrawPairing[] = [];
  if (ids.length % 2 === 1) {
    pairings.push({ slot: 0, player1Id: ids.pop()!, player2Id: null });
  }
  for (let i = 0, j = ids.length - 1; i < j; i++, j--) {
    pairings.push({ slot: pairings.length, player1Id: ids[i], player2Id: ids[j] });
  }
  return pairings;
}

/** Draw a round: re-seed the field by rating each round so the strongest meet last. */
export function drawRound(entrants: readonly DrawEntrant[], random: RandomSource = Math.random): DrawPairing[] {
  return pairSeeded(seedEntrants(entrants, random));
}

export interface DrawMatchState {
  player1Id: string;
  player2Id: string;
  player1Score: number | null;
  player2Score: number | null;
  /** Who batted first in this match, when both have batted. */
  firstBatterId?: string | null;
  /** Who batted first in an earlier tied attempt at this match. */
  tiedFirstBatterId?: string | null;
}

/**
 * The winner of a draw match when its round closes, or null when nobody goes through.
 * Both batted → higher score (level → first to bat); one batted → them; neither → the
 * first batter of an earlier tie, else nobody.
 */
export function settleDrawMatch(m: DrawMatchState): string | null {
  const p1 = m.player1Score;
  const p2 = m.player2Score;
  if (p1 != null && p2 != null) {
    if (p1 > p2) return m.player1Id;
    if (p2 > p1) return m.player2Id;
    return m.tiedFirstBatterId ?? m.firstBatterId ?? null;
  }
  if (p1 != null) return m.player1Id;
  if (p2 != null) return m.player2Id;
  return m.tiedFirstBatterId ?? null;
}

/** Rounds still needed to crown a champion from a field of this size. */
export function roundsRemaining(fieldSize: number): number {
  return fieldSize <= 1 ? 0 : Math.ceil(Math.log2(fieldSize));
}

/** Name of a round from the number of players drawn into it. */
export function drawRoundLabel(fieldSize: number, roundNumber: number): string {
  const matches = Math.ceil(fieldSize / 2);
  if (matches <= 1) return 'Final';
  if (matches === 2) return 'Semi-final';
  if (matches <= 4) return 'Quarter-final';
  return `Round ${roundNumber}`;
}

/** When a scheduled round opens: start + (n − 1) × round length. */
export function drawRoundOpensAt(startDate: Date | string, roundMinutes: number, roundNumber: number): Date {
  return new Date(new Date(startDate).getTime() + (roundNumber - 1) * roundMinutes * 60_000);
}

/** Expected finish for a field, assuming no buybacks change its size. */
export function estimatedDrawFinish(startDate: Date | string, roundMinutes: number, fieldSize: number): Date {
  const rounds = Math.max(1, roundsRemaining(fieldSize));
  return drawRoundOpensAt(startDate, roundMinutes, rounds + 1);
}
