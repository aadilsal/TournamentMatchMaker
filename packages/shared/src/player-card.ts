/** Personalised player card for the headset: one player's standing in each of their tournaments. */

export type PlayerTournamentStatus =
  | 'registered'
  | 'active'
  | 'through'
  | 'knocked_out'
  | 'champion'
  | 'finished';

export type PlayerMatchState = 'your_turn' | 'waiting_for_opponent' | 'decided';

export interface PlayerCardTournament {
  id: string;
  name: string;
  status: 'upcoming' | 'live' | 'finished';
  startDate: string;
  overs: number;
  ballsPerInnings: number;
  playingAt: { type: 'venue'; id: string; name: string; city: string } | { type: 'home'; name: 'Home' } | null;
  myStatus: PlayerTournamentStatus;
  statusText: string;
  round: { number: number; label: string; state: 'upcoming' | 'open' | 'closed'; opensAt: string | null; closesAt: string | null } | null;
  match: {
    id: string;
    opponent: string;
    state: PlayerMatchState;
    myScore: number;
    opponentScore: number;
    /** The opponent is batting first right now (started, heartbeat fresh); null otherwise. Additive. */
    opponentBattingSince?: string | null;
    /** If the opponent stops sending heartbeats, their innings counts as 0 at this time. Additive. */
    turnFreesAt?: string | null;
  } | null;
}

export interface PlayerCard {
  userId: string;
  username: string;
  city: string | null;
  greeting: string;
  hasVrHeadset: boolean;
  skillTier: number;
  skillTierLabel: string;
  ratingPoints: number;
  record: { played: number; wins: number; losses: number };
  tournaments: PlayerCardTournament[];
}

export interface PlayerStandingInput {
  tournamentStatus: string;
  participantStatus: string | null;
  participantRound: number | null;
  currentRound: number | null;
  isChampion: boolean;
}

/** Where the player stands in one tournament. */
export function playerTournamentStatus(s: PlayerStandingInput): PlayerTournamentStatus {
  if (s.tournamentStatus === 'completed') return s.isChampion ? 'champion' : 'finished';
  if (s.tournamentStatus !== 'in_progress') return 'registered';
  if (s.participantStatus === 'eliminated' || s.participantStatus === 'out') return 'knocked_out';
  if (s.participantRound != null && s.currentRound != null && s.participantRound > s.currentRound) return 'through';
  return 'active';
}

/** "Sat 21 Nov, 4:17 PM" — same shape as the web app's dates. */
function when(iso: string | null, timeZone?: string): string {
  if (!iso) return 'soon';
  const p: Record<string, string> = {};
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  };
  for (const part of new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date(iso))) p[part.type] = part.value;
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export interface StatusTextInput {
  status: PlayerTournamentStatus;
  tournamentName: string;
  startDate: string;
  roundLabel: string | null;
  roundClosesAt: string | null;
  opponent: string | null;
  matchState: PlayerMatchState | null;
  /** The opponent is batting first right now. */
  opponentBatting?: boolean;
  timeZone?: string;
}

/** One plain sentence telling the player what is happening and what to do next. */
export function playerStatusText(i: StatusTextInput): string {
  const round = i.roundLabel ?? 'this round';
  switch (i.status) {
    case 'registered':
      return `You're in! ${i.tournamentName} starts ${when(i.startDate, i.timeZone)}.`;
    case 'champion':
      return `You won ${i.tournamentName}! 🏆`;
    case 'finished':
      return `${i.tournamentName} has finished. Thanks for playing!`;
    case 'knocked_out':
      return `You're out of ${i.tournamentName}. Better luck next time!`;
    case 'through':
      return `You're through! The next draw is ${when(i.roundClosesAt, i.timeZone)}.`;
    case 'active':
      if (i.matchState === 'waiting_for_opponent')
        return `You've played your ${round}. Waiting for ${i.opponent ?? 'your opponent'}.`;
      if (i.opponentBatting)
        return `${i.opponent ?? 'Your opponent'} is batting now. You'll chase their score once they finish.`;
      if (i.opponent) return `${round}: play ${i.opponent} before ${when(i.roundClosesAt, i.timeZone)}.`;
      return `${round} is on. Your match is being drawn.`;
  }
}

/** Short hello for the headset's menu. */
export function playerGreeting(username: string, tournaments: readonly PlayerCardTournament[], played?: number): string {
  if (tournaments.some((t) => t.myStatus === 'champion')) return `Congratulations, champion ${username}!`;
  if (tournaments.some((t) => t.match?.state === 'your_turn' && !t.match.opponentBattingSince))
    return `Welcome back, ${username} — your match is ready!`;
  return played === 0 ? `Welcome, ${username}!` : `Welcome back, ${username}!`;
}
