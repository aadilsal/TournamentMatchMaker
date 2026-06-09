import type { Match, Notification, QueueStatus } from './types.js';

export interface QueueJoinedEvent {
  position: number;
  queueSize: number;
}

export interface QueuePositionEvent {
  position: number;
  waitSeconds: number;
}

export interface MatchFoundEvent {
  matchId: string;
  opponent: { id: string; username: string; skillTier: number };
  venue?: { id: string; name: string; city: string };
  slot?: { id: string; startTime: string; endTime: string };
  confirmDeadline: string;
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
}

export interface ServerToClientEvents {
  'queue:joined': (data: QueueJoinedEvent) => void;
  'queue:position': (data: QueuePositionEvent) => void;
  'match:found': (data: MatchFoundEvent) => void;
  'notification:new': (data: NotificationNewEvent) => void;
  'slot:updated': (data: SlotUpdatedEvent) => void;
}

export interface ClientToServerEvents {
  'match:confirmed': (data: MatchConfirmedClientEvent) => void;
  'match:declined': (data: MatchDeclinedClientEvent) => void;
}

export type { QueueStatus, Match, Notification };
