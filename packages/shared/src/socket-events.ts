import type { Match, Notification, QueueStatus } from './types.js';

export interface QueueJoinedEvent {
  position: number;
  queueSize: number;
}

export interface QueuePositionEvent {
  position: number;
  waitSeconds: number;
}

export interface QueueUpdatedEvent {
  inQueue: boolean;
  position?: number | null;
  queueSize?: number;
  tournamentId?: string | null;
}

export interface QueuePairFailedEvent {
  reason: 'no_slots' | 'slot_lock_failed' | 'venue_required' | 'pairing_error' | 'slot_expired';
  message: string;
  retryable: boolean;
}

export interface MatchFoundEvent {
  matchId: string;
  opponent: { id: string; username: string; skillTier: number };
  venue?: { id: string; name: string; city: string };
  slot?: { id: string; startTime: string; endTime: string };
  confirmDeadline: string;
  chaseTarget?: number | null;
  amChasing?: boolean;
  autoConfirmed?: boolean;
}

export type MatchUpdatedStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface MatchUpdatedEvent {
  matchId: string;
  status: MatchUpdatedStatus;
}

export interface MatchConfirmedClientEvent {
  matchId: string;
}

export interface MatchDeclinedClientEvent {
  matchId: string;
}

export interface NotificationNewEvent {
  notification: Notification;
}

export interface SlotUpdatedEvent {
  venueId: string;
  slotId: string;
  status: string;
  date?: string;
}

export interface BookingUpdatedEvent {
  bookingId?: string;
  action: 'created' | 'cancelled';
}

export interface ServerToClientEvents {
  'queue:joined': (data: QueueJoinedEvent) => void;
  'queue:position': (data: QueuePositionEvent) => void;
  'queue:updated': (data: QueueUpdatedEvent) => void;
  'queue:pair_failed': (data: QueuePairFailedEvent) => void;
  'match:found': (data: MatchFoundEvent) => void;
  'match:updated': (data: MatchUpdatedEvent) => void;
  'notification:new': (data: NotificationNewEvent) => void;
  'slot:updated': (data: SlotUpdatedEvent) => void;
  'booking:updated': (data: BookingUpdatedEvent) => void;
}

export interface ClientToServerEvents {
  'match:confirmed': (data: MatchConfirmedClientEvent) => void;
  'match:declined': (data: MatchDeclinedClientEvent) => void;
}

export type { QueueStatus, Match, Notification };
