import type {
  Booking,
  Buyback,
  Match,
  MatchPhase,
  MatchResult,
  MatchStatus,
  Notification,
  NotificationChannel,
  NotificationStatus,
  ParticipantStatus,
  RoundStatus,
  TimeSlot,
  Tournament,
  TournamentFormat,
  TournamentParticipant,
  TournamentPhase,
  TournamentRegistration,
  TournamentRound,
  TournamentStatus,
  User,
  UserRole,
  Venue,
} from '@vr-tournament/shared';

interface UserRow {
  id: string;
  email: string;
  username: string;
  country: string | null;
  city: string | null;
  has_vr_headset: boolean;
  vr_device_type: string | null;
  latitude: number | null;
  longitude: number | null;
  skill_tier: number;
  rating_points?: number;
  role: string;
  profile_picture?: Buffer | null;
  created_at: Date;
  updated_at: Date;
}

interface VenueRow {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  capacity: number;
  active: boolean;
  dist_m?: number;
  created_at: Date;
  updated_at: Date;
}

interface SlotRow {
  id: string;
  venue_id: string;
  start_time: Date;
  end_time: Date;
  max_capacity: number;
  booked_count: number;
  status: string;
  created_at: Date;
}

interface BookingRow {
  id: string;
  user_id: string;
  time_slot_id: string;
  status: string;
  created_at: Date;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    country: row.country,
    city: row.city,
    hasVrHeadset: row.has_vr_headset,
    vrDeviceType: row.vr_device_type,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    skillTier: row.skill_tier,
    ratingPoints: row.rating_points ?? 650,
    role: row.role as UserRole,
    hasProfilePicture: !!row.profile_picture?.length,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    capacity: row.capacity,
    active: row.active,
    distanceM: row.dist_m,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapSlot(row: SlotRow): TimeSlot {
  return {
    id: row.id,
    venueId: row.venue_id,
    startTime: row.start_time.toISOString(),
    endTime: row.end_time.toISOString(),
    maxCapacity: row.max_capacity,
    bookedCount: row.booked_count,
    status: row.status as TimeSlot['status'],
    createdAt: row.created_at.toISOString(),
  };
}

export function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    userId: row.user_id,
    timeSlotId: row.time_slot_id,
    status: row.status as Booking['status'],
    createdAt: row.created_at.toISOString(),
  };
}

interface TournamentRow {
  id: string;
  name: string;
  game: string;
  format: string;
  start_date: Date;
  end_date: Date;
  status: string;
  max_players: number | null;
  skill_tier?: number;
  phase?: string;
  current_round_number?: number;
  buyback_price_cents?: number;
  created_at: Date;
  registration_count?: number;
}

interface RegistrationRow {
  id: string;
  tournament_id: string;
  user_id: string;
  booking_id: string | null;
  registered_at: Date;
}

interface MatchRow {
  id: string;
  tournament_id: string | null;
  player1_id: string;
  player2_id: string;
  venue_id: string | null;
  time_slot_id: string | null;
  status: string;
  result: MatchResult | null;
  scheduled_at: Date | null;
  round_number?: number | null;
  phase?: string | null;
  bracket_slot?: number | null;
  created_at: Date;
  updated_at: Date;
  p1_username?: string;
  p1_skill_tier?: number;
  p1_has_vr?: boolean;
  p2_username?: string;
  p2_skill_tier?: number;
  p2_has_vr?: boolean;
  venue_name?: string;
  venue_city?: string;
  venue_address?: string;
  slot_start?: Date;
  slot_end?: Date;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  payload: Record<string, unknown>;
  read: boolean;
  status: string;
  sent_at: Date | null;
  created_at: Date;
}

export function mapTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    name: row.name,
    game: row.game,
    format: row.format as TournamentFormat,
    startDate: row.start_date.toISOString(),
    endDate: row.end_date.toISOString(),
    status: row.status as TournamentStatus,
    maxPlayers: row.max_players,
    skillTier: row.skill_tier ?? 3,
    phase: (row.phase ?? 'normal') as TournamentPhase,
    currentRoundNumber: row.current_round_number ?? 1,
    buybackPriceCents: row.buyback_price_cents ?? 500,
    registrationCount: row.registration_count,
    createdAt: row.created_at.toISOString(),
  };
}

interface TournamentRoundRow {
  id: string;
  tournament_id: string;
  round_number: number;
  starts_at: Date;
  ends_at: Date;
  status: string;
  created_at: Date;
}

export function mapTournamentRound(row: TournamentRoundRow): TournamentRound {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status as RoundStatus,
    createdAt: row.created_at.toISOString(),
  };
}

interface ParticipantRow {
  id: string;
  tournament_id: string;
  user_id: string;
  status: string;
  wins: number;
  losses: number;
  buyback_count: number;
  round_number: number;
  created_at: Date;
  updated_at: Date;
  username?: string;
}

export function mapParticipant(row: ParticipantRow): TournamentParticipant {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    username: row.username,
    status: row.status as ParticipantStatus,
    wins: row.wins,
    losses: row.losses,
    buybackCount: row.buyback_count,
    roundNumber: row.round_number,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface BuybackRow {
  id: string;
  user_id: string;
  tournament_id: string;
  round_number: number;
  match_id: string | null;
  amount_cents: number;
  status: string;
  created_at: Date;
}

export function mapBuyback(row: BuybackRow): Buyback {
  return {
    id: row.id,
    userId: row.user_id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    matchId: row.match_id,
    amountCents: row.amount_cents,
    status: row.status as Buyback['status'],
    createdAt: row.created_at.toISOString(),
  };
}

export function mapRegistration(row: RegistrationRow): TournamentRegistration {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    bookingId: row.booking_id,
    registeredAt: row.registered_at.toISOString(),
  };
}

export function mapMatch(row: MatchRow): Match {
  const match: Match = {
    id: row.id,
    tournamentId: row.tournament_id,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    venueId: row.venue_id,
    timeSlotId: row.time_slot_id,
    status: row.status as MatchStatus,
    result: row.result,
    scheduledAt: row.scheduled_at?.toISOString() ?? null,
    roundNumber: row.round_number ?? null,
    phase: (row.phase as MatchPhase) ?? null,
    bracketSlot: row.bracket_slot ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };

  if (row.p1_username) {
    match.player1 = {
      id: row.player1_id,
      username: row.p1_username,
      skillTier: row.p1_skill_tier ?? 3,
      hasVrHeadset: row.p1_has_vr ?? false,
    };
  }
  if (row.p2_username) {
    match.player2 = {
      id: row.player2_id,
      username: row.p2_username,
      skillTier: row.p2_skill_tier ?? 3,
      hasVrHeadset: row.p2_has_vr ?? false,
    };
  }
  if (row.venue_name) {
    match.venue = {
      id: row.venue_id!,
      name: row.venue_name,
      city: row.venue_city!,
      address: row.venue_address!,
    };
  }
  if (row.slot_start) {
    match.slot = {
      id: row.time_slot_id!,
      startTime: row.slot_start.toISOString(),
      endTime: row.slot_end!.toISOString(),
    };
  }

  return match;
}

export function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    channel: row.channel as NotificationChannel,
    payload: row.payload ?? {},
    read: row.read,
    status: row.status as NotificationStatus,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
