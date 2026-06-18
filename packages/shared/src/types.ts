export type UserRole = 'player' | 'venue_admin' | 'tournament_admin' | 'superadmin';

export type SlotStatus = 'available' | 'full' | 'locked';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type TournamentStatus = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed';

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin';

export type TournamentPhase = 'normal' | 'knockout' | 'completed';

export type MatchPhase = 'normal' | 'knockout';

export type ParticipantStatus = 'active' | 'eliminated' | 'advanced' | 'knockout' | 'out';

export type RoundStatus = 'active' | 'closed';

export type BuybackStatus = 'completed' | 'pending' | 'failed';

export type KnockoutRoundLabel = 'ro16' | 'qf' | 'sf' | 'final';

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
  hasProfilePicture?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPlayerProfile {
  id: string;
  username: string;
  country: string | null;
  city: string | null;
  hasVrHeadset: boolean;
  vrDeviceType: string | null;
  skillTier: number;
  hasProfilePicture: boolean;
  totalWins: number;
  totalLosses: number;
  totalMatches: number;
  createdAt: string;
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
  skillTier: number;
  phase: TournamentPhase;
  currentRoundNumber: number;
  buybackPriceCents: number;
  registrationCount?: number;
  createdAt: string;
}

export interface TournamentRound {
  id: string;
  tournamentId: string;
  roundNumber: number;
  startsAt: string;
  endsAt: string;
  status: RoundStatus;
  createdAt: string;
}

export interface TournamentParticipant {
  id: string;
  tournamentId: string;
  userId: string;
  username?: string;
  status: ParticipantStatus;
  wins: number;
  losses: number;
  buybackCount: number;
  roundNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface Buyback {
  id: string;
  userId: string;
  tournamentId: string;
  roundNumber: number;
  matchId: string | null;
  amountCents: number;
  status: BuybackStatus;
  createdAt: string;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  userId: string;
  bookingId: string | null;
  registeredAt: string;
}

export interface MatchResult {
  player1Score: number | null;
  player2Score: number | null;
  winnerId: string | null;
}

export interface Match {
  id: string;
  tournamentId: string | null;
  player1Id: string;
  player2Id: string;
  venueId: string | null;
  timeSlotId: string | null;
  status: MatchStatus;
  result: MatchResult | null;
  scheduledAt: string | null;
  roundNumber: number | null;
  phase: MatchPhase | null;
  bracketSlot: number | null;
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
  label?: string;
  phase?: MatchPhase | 'knockout';
  matches: Array<{
    matchId?: string;
    bracketSlot?: number;
    player1: { id: string; username: string; skillTier: number } | null;
    player2: { id: string; username: string; skillTier: number } | null;
    status?: MatchStatus;
    winnerId?: string | null;
  }>;
}

export interface TournamentBracket {
  tournamentId: string;
  format: TournamentFormat;
  phase: TournamentPhase;
  rounds: BracketRound[];
}
