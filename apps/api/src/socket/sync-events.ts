import type { BookingUpdatedEvent, MatchUpdatedEvent, QueueUpdatedEvent, SlotUpdatedEvent } from '@vr-tournament/shared';
import { emitBroadcast, emitToUser } from './emitters.js';

export function emitMatchUpdated(playerIds: string[], payload: MatchUpdatedEvent) {
  const unique = [...new Set(playerIds.filter(Boolean))];
  for (const userId of unique) {
    emitToUser(userId, 'match:updated', payload);
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
