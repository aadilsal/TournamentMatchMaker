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
  /**
   * A bot opponent, not a person.
   *
   * Bots carry ordinary usernames on purpose — a player facing one should see a
   * normal match — so this flag is the only thing that distinguishes them, and
   * the admin surfaces are where it must always be visible.
   */
  isBot?: boolean;
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
  /** Registration window — the buffer before play begins. */
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
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

/**
 * Why a solo innings is or is not available right now.
 *
 * `canSubmitSoloTarget` is one bit covering several very different situations,
 * and a headset cannot tell "you already batted this round" from "the round is
 * changing over, ask again in a moment" — the second is a wait, the first is
 * not. Every value here maps to exactly one thing `POST /solo-target` would
 * answer, so the client can say what is happening instead of hiding the button.
 */
export type MetaSoloTargetState =
  /** Go ahead — `POST /solo-target` will not fail on a precondition. */
  | 'available'
  /** Holding a match (including one awaiting confirmation); play that instead. */
  | 'in_match'
  /** Not in a matchmaking queue at all. */
  | 'not_queued'
  /** Queued, but not as an active participant of a tournament round. */
  | 'not_participant'
  /** This round's innings is already on the board. */
  | 'already_played'
  /** The round window has ended; the next round opens shortly. */
  | 'round_closed'
  /**
   * Holding a match, but the opponent is batting right now. Keep polling —
   * this turns into a normal chase as soon as their score lands.
   */
  | 'waiting_for_opponent';

export interface MetaCurrentMatchResponse {
  inQueue: boolean;
  /** Tournament the player is queued for / playing in — required by `POST /solo-target`. */
  tournamentId: string | null;
  canSubmitSoloTarget: boolean;
  /** The reason behind `canSubmitSoloTarget`; `'available'` exactly when it is true. */
  soloTargetState: MetaSoloTargetState;
  match: {
    id: string;
    opponent: string;
    venue: string | null;
    startTime: string | null;
    endTime: string | null;
    /**
     * Runs needed to win — always one more than the opponent scored, so
     * reaching it wins rather than ties.
     *
     * `-1` when there is no target yet. Never null: the headset parses it as an
     * integer. The sentinel is negative rather than 0 so it can never be
     * confused with a genuine innings — an opponent bowled out for a duck sets
     * a target of 1, and 0 stays available as a real score.
     */
    chaseTarget: number;
    amChasing: boolean;
    /** No target set yet and this player bats first — their score becomes the target. */
    amSettingTarget: boolean;
    /**
     * `-1` when the innings has not been played. A genuine duck is 0, and the
     * two are now distinguishable without consulting any other field.
     */
    myScore: number;
    opponentScore: number;
    /**
     * The opponent is batting right now and this player must wait. Nothing is
     * submittable while this is true; keep polling and it clears to a chase
     * with a real target once their innings lands.
     */
    waitingForOpponent: boolean;
  } | null;
  /**
   * The player's most recently decided match, for a few minutes after it ends.
   * `null` when there is nothing recent to report, or while a match is still
   * being played. Additive — a client that ignores it behaves exactly as before.
   */
  lastResult: MetaMatchDecision | null;
}

/** No innings yet. Negative so it can never collide with a real score. */
export const NO_SCORE = -1;

/**
 * A match that has just been decided, carried on the poll so the headset can
 * show the outcome.
 *
 * The player who bats first learns nothing from their own submission — it
 * returns while the match is still open, waiting on the opponent — so this is
 * the only way the result reaches them. It appears once the match is fully
 * decided and never before: while an innings is still outstanding there is no
 * decision to report, and in particular no tie.
 */
export interface MetaMatchDecision {
  matchId: string;
  opponent: string;
  myScore: number;
  opponentScore: number;
  /** `'tie'` means level scores — see `rematchQueued`. */
  outcome: 'win' | 'loss' | 'tie';
  /**
   * The match was tied and both players have been put back in the queue for a
   * fresh match. Show the result first; the rematch is what happens next, not
   * an alternative to seeing how the match ended.
   *
   * Never true while a match is still being played — a tie cannot be declared
   * until both innings are on record.
   */
  rematchQueued: boolean;
  decidedAt: string;
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
  /**
   * How the match ended. It names no side: `'win'` is written on every decided
   * match whoever won, so it cannot answer "did my player win?" — read
   * `winnerId` for that.
   *
   * `'rematch'` means the scores were level and the pair have been re-queued
   * for a new match. It is only ever written once both innings are on record —
   * a tie cannot be declared while one player is still batting.
   */
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
  /**
   * The window *this viewer* chose for the round, which need not be the same as
   * `slot` — pairing does not require the two players' windows to overlap, so
   * the match is anchored to one of them while each player plays in their own.
   * Present on `GET /matches/me`.
   */
  mySlot?: Pick<TimeSlot, 'id' | 'startTime' | 'endTime'> | null;
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
