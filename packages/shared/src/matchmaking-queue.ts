/** Redis queue metadata shape — single source of truth for API and worker */

export const QUEUE_GLOBAL = 'queue:global';
export const QUEUE_MEMBER = 'queue:member';
export const QUEUE_TOURNAMENT_INDEX = 'queue:tournament:ids';

export function queueTournamentKey(tournamentId: string): string {
  return `queue:tournament:${tournamentId}`;
}

export function queuePlayerKey(userId: string): string {
  return `queue:player:${userId}`;
}

export interface QueuePlayerHash {
  userId: string;
  skillTier: string;
  hasVr: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  joinedAt: string;
  tournamentId: string;
  preferredVenueId: string;
  roundNumber: string;
  bookingId: string;
}

export interface QueuePlayerMeta {
  userId: string;
  skillTier: number;
  hasVr: boolean;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  joinedAt: number;
  tournamentId: string | null;
  preferredVenueId: string | null;
  roundNumber: number;
  bookingId: string | null;
}

export interface BuildQueuePlayerHashInput {
  userId: string;
  skillTier: number;
  hasVr: boolean;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  joinedAt: number;
  tournamentId?: string | null;
  preferredVenueId?: string | null;
  roundNumber?: number;
  bookingId?: string | null;
}

export function buildQueuePlayerHash(input: BuildQueuePlayerHashInput): QueuePlayerHash {
  const lat = input.latitude;
  const lng = input.longitude;
  return {
    userId: input.userId,
    skillTier: String(input.skillTier),
    hasVr: input.hasVr ? '1' : '0',
    city: input.city ?? '',
    country: input.country ?? '',
    latitude: lat === null || lat === undefined ? '' : String(lat),
    longitude: lng === null || lng === undefined ? '' : String(lng),
    joinedAt: String(input.joinedAt),
    tournamentId: input.tournamentId ?? '',
    preferredVenueId: input.preferredVenueId ?? '',
    roundNumber: String(input.roundNumber ?? 1),
    bookingId: input.bookingId ?? '',
  };
}

export function parseQueuePlayerMeta(hash: Record<string, string>): QueuePlayerMeta | null {
  if (!hash.userId) return null;
  return {
    userId: hash.userId,
    skillTier: parseInt(hash.skillTier, 10) || 3,
    hasVr: hash.hasVr === '1',
    city: hash.city || null,
    country: hash.country || null,
    latitude: hash.latitude ? parseFloat(hash.latitude) : null,
    longitude: hash.longitude ? parseFloat(hash.longitude) : null,
    joinedAt: parseInt(hash.joinedAt, 10) || 0,
    tournamentId: hash.tournamentId || null,
    preferredVenueId: hash.preferredVenueId || null,
    roundNumber: parseInt(hash.roundNumber, 10) || 1,
    bookingId: hash.bookingId || null,
  };
}
