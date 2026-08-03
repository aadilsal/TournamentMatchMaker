import type {
  BookingUpdatedEvent,
  MatchUpdatedEvent,
  QueueUpdatedEvent,
  SlotUpdatedEvent,
  TournamentUpdatedEvent,
} from '@vr-tournament/shared';
import { emitBroadcast, emitToUser } from './emitters.js';

export function emitMatchUpdated(playerIds: string[], payload: MatchUpdatedEvent) {
  const unique = [...new Set(playerIds.filter(Boolean))];
  for (const userId of unique) {
    emitToUser(userId, 'match:updated', payload);
  }
  if (payload.tournamentId) {
    emitTournamentUpdated({
      tournamentId: payload.tournamentId,
      reason: 'match_updated',
    });
  }
}

export function emitQueueUpdated(userId: string, payload: QueueUpdatedEvent) {
  emitToUser(userId, 'queue:updated', payload);
}

export function emitBookingUpdated(userId: string, payload: BookingUpdatedEvent) {
  emitToUser(userId, 'booking:updated', payload);
}

export function emitSlotUpdated(payload: SlotUpdatedEvent) {
  emitBroadcast('slot:updated', payload);
}

/**
 * Registration counts, brackets and participant lists are shown on the public
 * tournament list, the tournament detail page and the admin panel at once, so
 * this is a broadcast rather than a per-user event.
 */
export function emitTournamentUpdated(payload: TournamentUpdatedEvent) {
  emitBroadcast('tournament:updated', payload);
}
