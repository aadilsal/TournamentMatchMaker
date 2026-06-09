export type UserRole = 'player' | 'venue_admin' | 'tournament_admin' | 'superadmin';

export type SlotStatus = 'available' | 'full' | 'locked';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type TournamentStatus = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed';

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin';

export type MatchStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type NotificationChannel = 'in_app' | 'email';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  cursor?: string | null;
  total?: number;
  limit?: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  country: string | null;
  city: string | null;
  hasVrHeadset: boolean;
  vrDeviceType: string | null;
  latitude: number | null;
  longitude: number | null;
  skillTier: number;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  capacity: number;
  active: boolean;
  distanceM?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  id: string;
  venueId: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  bookedCount: number;
  status: SlotStatus;
  createdAt: string;
}

export interface Booking {
  id: string;
  userId: string;
  timeSlotId: string;
  status: BookingStatus;
  createdAt: string;
  slot?: TimeSlot;
  venue?: Venue;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

export interface Tournament {
  id: string;
  name: string;
  game: string;
  format: TournamentFormat;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  maxPlayers: number | null;
  registrationCount?: number;
  createdAt: string;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  userId: string;
  bookingId: string | null;
  registeredAt: string;
}

export interface Match {
  id: string;
  tournamentId: string | null;
  player1Id: string;
  player2Id: string;
  venueId: string | null;
  timeSlotId: string | null;
  status: MatchStatus;
  result: Record<string, unknown> | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  player1?: Pick<User, 'id' | 'username' | 'skillTier' | 'hasVrHeadset'>;
  player2?: Pick<User, 'id' | 'username' | 'skillTier' | 'hasVrHeadset'>;
  venue?: Pick<Venue, 'id' | 'name' | 'city' | 'address'>;
  slot?: Pick<TimeSlot, 'id' | 'startTime' | 'endTime'>;
}

export interface QueueStatus {
  inQueue: boolean;
  position: number | null;
  waitSeconds: number;
  queueSize: number;
  tournamentId: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
  read: boolean;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
}

export interface BracketRound {
  round: number;
  matches: Array<{
    matchId?: string;
    player1: { id: string; username: string; skillTier: number } | null;
    player2: { id: string; username: string; skillTier: number } | null;
    status?: MatchStatus;
  }>;
}

export interface TournamentBracket {
  tournamentId: string;
  format: TournamentFormat;
  rounds: BracketRound[];
}
