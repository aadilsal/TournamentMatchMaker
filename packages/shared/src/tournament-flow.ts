import type { ParticipantStatus } from './types.js';

export const TOURNAMENT_FLOW_GUIDE = {
  title: 'How tournaments run',
  summary:
    'All tournaments follow the same flow. Players join, play normal rounds within a time limit, and winners advance when each round ends. Knockout begins once half the original field or fewer remain.',
  sections: [
    {
      title: 'Normal rounds',
      body: 'Players enter the queue and get matched by skill tier. Each normal round has a deadline you set (minutes, hours, or days — e.g. 2 days). When the round expires, players with the best records advance to the next round.',
    },
    {
      title: 'Buybacks',
      body: 'Before knockout starts, eliminated players can buy back in and rejoin the queue for the current round — as long as the round deadline has not passed and more than half the original field is still competing.',
    },
    {
      title: 'Knockout',
      body: 'When active players drop to 50% or fewer of the starting field, the tournament moves to a knockout bracket. From there it is win-and-advance until a champion is crowned. Buybacks are no longer available.',
    },
    {
      title: 'Venue slots',
      body: 'Booked venue time slots must fall within the active round window. Matches are only scheduled into slots that end before the round deadline.',
    },
  ],
} as const;

export type TournamentStatusValue = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed';

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatusValue, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  in_progress: 'In progress',
  completed: 'Completed',
};

/**
 * The only status moves the guided lifecycle bar offers. The edit form uses the
 * same map so an admin cannot bypass the guardrails by jumping straight to an
 * arbitrary status from the raw dropdown.
 */
export const TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatusValue, TournamentStatusValue[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

/** Statuses selectable from `current`, always including `current` itself (no change). */
export function allowedTournamentStatuses(current: TournamentStatusValue): TournamentStatusValue[] {
  return [current, ...TOURNAMENT_STATUS_TRANSITIONS[current]];
}

export function isValidTournamentTransition(
  from: TournamentStatusValue,
  to: TournamentStatusValue
): boolean {
  return from === to || TOURNAMENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * A player may hold a place in only one unfinished tournament at a time.
 *
 * "Still in it" deliberately includes `eliminated`: that player can still buy
 * back into the round, so letting them register elsewhere would strand the
 * buyback they already paid for. Only `out` — beaten out, or withdrawn —
 * releases them.
 *
 * Once the tournament itself is completed nobody is holding a place in it, so
 * every participant is free regardless of the status left on their row.
 *
 * This is the single definition. The registration check, the queue-join check,
 * and the `liveTournament` field the UI reads all derive from it — they used to
 * each carry their own version and disagreed in both directions.
 */
export const TERMINAL_PARTICIPANT_STATUS = 'out' as const;

export function isLiveParticipation(
  participantStatus: ParticipantStatus,
  tournamentStatus: TournamentStatusValue
): boolean {
  if (tournamentStatus === 'completed') return false;
  return participantStatus !== TERMINAL_PARTICIPANT_STATUS;
}

/** SQL form of {@link isLiveParticipation}, for queries that join the two tables. */
export const LIVE_PARTICIPATION_SQL =
  `tp.status <> '${TERMINAL_PARTICIPANT_STATUS}' AND t.status <> 'completed'`;
