export const QUEUE_GLOBAL = 'queue:global';
export const QUEUE_MEMBER = 'queue:member';
export const MATCHMAKING_PAIR_LOCK = 'lock:matchmaking:pair';
export const SOCKET_EMIT_CHANNEL = 'socket:emit';

export function queueTournamentKey(tournamentId: string) {
  return `queue:tournament:${tournamentId}`;
}

export function queuePlayerKey(userId: string) {
  return `queue:player:${userId}`;
}

export function matchConfirmKey(matchId: string) {
  return `match:confirm:${matchId}`;
}

export function slotLockKey(slotId: string) {
  return `slot:lock:${slotId}`;
}
