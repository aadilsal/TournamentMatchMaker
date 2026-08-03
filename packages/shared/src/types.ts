export type UserRole = 'player' | 'venue_admin' | 'tournament_admin' | 'superadmin';

export type SlotStatus = 'available' | 'full' | 'locked';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type TournamentStatus = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed';

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
  ratingPoints?: number;
  role: UserRole;
  hasProfilePicture?: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * The unfinished tournament this player currently holds a place in, if any.
   * Present on `GET /players/me` only. The UI uses it to explain up front why
   * joining another tournament is unavailable, instead of letting the player
   * click Join and hit a 409.
   */
  liveTournament?: LiveTournamentRef | null;
}

export interface LiveTournamentRef {
  id: string;
  name: string;
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
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  maxPlayers: number | null;
  skillTier: number;
  phase: TournamentPhase;
  currentRoundNumber: number;
  buybackPriceCents: number;
  roundDurationMinutes: number;
  initialPlayerCount: number | null;
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
  soloTarget: number | null;
  soloPlayedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaCurrentMatchResponse {
  inQueue: boolean;
  /** Tournament the player is queued for / playing in — required by `POST /solo-target`. */
  tournamentId: string | null;
  canSubmitSoloTarget: boolean;
  match: {
    id: string;
    opponent: string;
    venue: string | null;
    startTime: string | null;
    endTime: string | null;
    chaseTarget: number | null;
    amChasing: boolean;
    /** No target set yet and this player bats first — their score becomes the target. */
    amSettingTarget: boolean;
    myScore: number | null;
    opponentScore: number | null;
  } | null;
}

export interface Buyback {
  id: string;
  userId: string;
  tournamentId: string;
  roundNumber: number;
  matchId: string | null;
  amountCents: number;
  status: BuybackStatus;
  stripePaymentIntentId: string | null;
  createdAt: string;
}

export interface BuybackCheckoutSession {
  clientSecret: string;
  buybackId: string;
  amountCents: number;
}

export interface BuybackOption {
  tournamentId: string;
  tournamentName: string;
  buybackPriceCents: number;
  roundNumber: number;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  userId: string;
  bookingId: string | null;
  registeredAt: string;
}

/**
 * The play window a player picked for one round. Non-VR players also hold a
 * venue booking for it; VR players play from home so `bookingId`/`venueId` stay
 * null, but they still own a slot so their match has a playable window.
 */
export interface TournamentRoundSlot {
  tournamentId: string;
  userId: string;
  roundNumber: number;
  timeSlotId: string;
  venueId: string | null;
  bookingId: string | null;
  slot?: TimeSlot;
  venue?: Pick<Venue, 'id' | 'name' | 'city' | 'address'>;
}

export interface EnterTournamentResult {
  registration: TournamentRegistration;
  booking: Booking | null;
  roundSlot: TournamentRoundSlot | null;
  searching: boolean;
}

export type MatchScoreSource = 'meta' | 'manual';

export interface MatchResult {
  player1Score: number | null;
  player2Score: number | null;
  winnerId: string | null;
}

export interface MatchResultExtended extends MatchResult {
  player1Target?: number | null;
  player2Target?: number | null;
  chaseTarget?: number | null;
  chasePlayerId?: string | null;
  source?: MatchScoreSource;
  outcome?: 'win' | 'loss' | 'rematch' | 'solo_pending' | null;
}

export interface MatchConfirmations {
  player1Confirmed: boolean;
  player2Confirmed: boolean;
}

export interface Match {
  id: string;
  tournamentId: string | null;
  player1Id: string;
  player2Id: string;
  venueId: string | null;
  timeSlotId: string | null;
  status: MatchStatus;
  result: MatchResultExtended | null;
  scheduledAt: string | null;
  roundNumber: number | null;
  phase: MatchPhase | null;
  bracketSlot: number | null;
  rematchOfMatchId: string | null;
  createdAt: string;
  updatedAt: string;
  player1?: Pick<User, 'id' | 'username' | 'skillTier' | 'hasVrHeadset'>;
  player2?: Pick<User, 'id' | 'username' | 'skillTier' | 'hasVrHeadset'>;
  venue?: Pick<Venue, 'id' | 'name' | 'city' | 'address'>;
  slot?: Pick<TimeSlot, 'id' | 'startTime' | 'endTime'>;
  confirmations?: MatchConfirmations | null;
}

export interface QueueStatus {
  inQueue: boolean;
  position: number | null;
  waitSeconds: number;
  queueSize: number;
  tournamentId: string | null;
  roundNumber: number | null;
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
  phase: TournamentPhase;
  fieldSize: number | null;
  rounds: BracketRound[];
}

export interface AdminDashboardStats {
  users: number;
  players: number;
  venues: number;
  activeVenues: number;
  tournaments: Record<TournamentStatus, number>;
  matches: {
    ongoing: number;
    upcoming: number;
    past: number;
    total: number;
  };
  bookings: { confirmed: number; pending: number; cancelled: number };
  buybacks: { completed: number; pending: number; failed: number };
  queueSize: number;
  notificationsFailed: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorUsername?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminBookingRow extends Booking {
  username?: string;
  email?: string;
  venueName?: string;
  slotStart?: string;
  slotEnd?: string;
  venueId?: string;
}

export interface AdminQueueEntry {
  userId: string;
  username: string;
  skillTier: number;
  tournamentId: string | null;
  tournamentName: string | null;
  preferredVenueId: string | null;
  roundNumber: number;
  waitSeconds: number;
  hasPlayedSolo: boolean;
  soloTarget: number | null;
}

export interface AdminQueueOverview {
  globalSize: number;
  tournaments: Array<{ tournamentId: string; name: string; size: number }>;
  entries: AdminQueueEntry[];
}

export interface SystemHealth {
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  tableCounts: Record<string, number>;
}

export interface AdminUserDetail extends User {
  suspendedAt: string | null;
  totalMatches: number;
  confirmedBookings: number;
  tournaments: Array<{
    id: string;
    name: string;
    status: string;
    wins: number;
    losses: number;
  }>;
}

export interface AdminIntegrationsConfig {
  meta: { configured: boolean; apiKeyPreview: string | null };
  email: { enabled: boolean; provider: string; from: string | null };
  stripe: { configured: boolean; mode: string };
}
