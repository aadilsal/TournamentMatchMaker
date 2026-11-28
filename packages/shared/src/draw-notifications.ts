/** Player-facing copy for draw-format tournament notifications (bell and email). */

export interface DrawNotice {
  title: string;
  message: string;
}

/** "about 2 days", "about 5 hours", "40 minutes" — time-zone free, so it reads right everywhere. */
export function timeLeft(untilIso: string | Date, now: number = Date.now()): string {
  const ms = new Date(untilIso).getTime() - now;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function tournamentStartingSoonNotice(t: { tournamentName: string; startsAt: string | Date }): DrawNotice {
  return {
    title: `${t.tournamentName} starts soon`,
    message: `${t.tournamentName} starts in ${timeLeft(t.startsAt)}. Your first opponent is drawn the moment it begins.`,
  };
}

export function roundStartedNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  closesAt: string | Date;
  playingAt?: string | null;
}): DrawNotice {
  const where = r.playingAt ? ` at ${r.playingAt}` : '';
  return {
    title: `${r.roundLabel} has started — ${r.tournamentName}`,
    message: `${r.roundLabel} of ${r.tournamentName} has started. You play ${r.opponent}${where} — play any time in the next ${timeLeft(r.closesAt)}.`,
  };
}

export function roundClosingSoonNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  closesAt: string | Date;
}): DrawNotice {
  return {
    title: `${timeLeft(r.closesAt)} left to play`,
    message: `Only ${timeLeft(r.closesAt)} left to play your ${r.roundLabel} against ${r.opponent} in ${r.tournamentName}. Miss it and you're out.`,
  };
}

export function opponentPlayedNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  opponentScore: number;
}): DrawNotice {
  return {
    title: `Your turn — score ${r.opponentScore + 1} to win`,
    message: `${r.opponent} scored ${r.opponentScore} in your ${r.roundLabel} (${r.tournamentName}). Your turn: score ${r.opponentScore + 1} to win.`,
  };
}

export function matchTiedNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  score: number;
  closesAt: string | Date;
}): DrawNotice {
  return {
    title: `It's a tie — replay your ${r.roundLabel}`,
    message: `${r.score}–${r.score} against ${r.opponent}! Replay your ${r.roundLabel} in ${r.tournamentName} within the next ${timeLeft(r.closesAt)}.`,
  };
}

export function drawWonNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  myScore: number | null;
  opponentScore: number | null;
  walkover: boolean;
  isFinal: boolean;
  nextDrawAt: string | Date | null;
  points?: PointsChange | null;
}): DrawNotice {
  const how = r.walkover
    ? `${r.opponent} didn't play in time`
    : `You beat ${r.opponent} ${r.myScore}–${r.opponentScore}`;
  const pts = pointsLine(r.points);
  if (r.isFinal) return { title: `You won ${r.tournamentName}! 🏆`, message: `${how} in the Final. You're the champion of ${r.tournamentName}!${pts}` };
  const next = r.nextDrawAt ? ` The next draw is in ${timeLeft(r.nextDrawAt)}.` : '';
  return { title: `You're through! — ${r.tournamentName}`, message: `${how} in your ${r.roundLabel}. You're through to the next round.${pts}${next}` };
}

/** Rating change after a result. */
export interface PointsChange {
  change: number;
  ratingPoints: number;
}

/** " +30 points (330 total)." — empty when the result was not rated (e.g. against a bot). */
function pointsLine(p: PointsChange | null | undefined): string {
  if (!p) return '';
  return ` ${p.change >= 0 ? '+' : '−'}${Math.abs(p.change)} points (${p.ratingPoints} total).`;
}

export function drawLostNotice(r: {
  tournamentName: string;
  roundLabel: string;
  opponent: string;
  myScore: number | null;
  opponentScore: number | null;
  walkover: boolean;
  buyback: { priceCents: number; until: string | Date } | null;
  points?: PointsChange | null;
}): DrawNotice {
  const how = r.walkover
    ? `You didn't play your ${r.roundLabel} in time`
    : `${r.opponent} beat you ${r.opponentScore}–${r.myScore} in your ${r.roundLabel}`;
  const buyback = r.buyback
    ? ` You can buy back in for ${money(r.buyback.priceCents)} in the next ${timeLeft(r.buyback.until)}.`
    : ' Thanks for playing!';
  return { title: `You're out of ${r.tournamentName}`, message: `${how}, so you're out of ${r.tournamentName}.${pointsLine(r.points)}${buyback}` };
}

export function buybackCompletedNotice(r: { tournamentName: string }): DrawNotice {
  return {
    title: `You're back in ${r.tournamentName}!`,
    message: `Buyback confirmed — you're back in ${r.tournamentName} and in the next round's draw.`,
  };
}

/** How long before a round closes to remind players who haven't played: a quarter of the round, 10 min–2 h. */
export function closingReminderMs(roundMinutes: number): number {
  return Math.min(2 * 3_600_000, Math.max(10 * 60_000, roundMinutes * 60_000 * 0.25));
}

/** How long before the start to remind registered players. */
export const STARTING_SOON_MS = 60 * 60_000;
