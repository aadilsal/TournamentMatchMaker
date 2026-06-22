import type { ApiError } from '@vr-tournament/shared';

const GENERIC = 'Something went wrong. Please try again.';

const BY_CODE: Record<string, string> = {
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That action is not available right now.',
  BAD_REQUEST: 'Please check your details and try again.',
  VALIDATION_ERROR: 'Please check your details and try again.',
  INTERNAL_ERROR: GENERIC,
  GEO_LOOKUP_FAILED: 'We could not detect your location. Enter your city manually.',
  GEO_OUT_OF_RANGE:
    'We could not find a supported venue city near you. Please select Lahore or Karachi manually.',
  GEO_CITIES_FAILED: 'We could not load cities for that country.',
};

const BY_MESSAGE: Record<string, string> = {
  'invalid email or password': 'Incorrect email or password. Please try again.',
  'invalid or expired refresh token': 'Your session has expired. Please sign in again.',
  'invalid or expired token': 'Your session has expired. Please sign in again.',
  'token has been revoked': 'Your session has ended. Please sign in again.',
  'missing or invalid authorization header': 'Please sign in to continue.',
  'authentication required': 'Please sign in to continue.',
  'refresh token missing': 'Your session has expired. Please sign in again.',
  'invalid request data': 'Please check your details and try again.',
  'email or username already exists': 'This email or username is already in use.',
  'this email is already registered': 'This email is already registered. Try signing in instead.',
  'this username is taken': 'This username is already taken. Please choose another.',
  'username already taken': 'This username is already taken. Please choose another.',
  'already in queue': 'You are already waiting for a match.',
  'you have an active match': 'You already have a match in progress.',
  'time slot is full': 'That time slot is full. Please pick another.',
  'time slot is currently locked': 'That time slot is no longer available.',
  'you already have a booking for this slot': 'You already booked this time slot.',
  'tournament is not open for registration': 'Registration for this tournament is closed.',
  'tournament is full': 'This tournament is full.',
  'match is not awaiting confirmation': 'This match can no longer be confirmed.',
  'not a participant': 'You are not part of this match.',
  'not a participant in this match': 'You are not part of this match.',
  'match cannot be declined': 'This match can no longer be declined.',
  'match is not currently playable': 'This match is not ready to play yet.',
  'scores must be submitted from your meta quest headset':
    'Scores are submitted from your Meta Quest headset.',
  'register for tournament before joining its queue': 'Register for the tournament before joining the queue.',
  'you are eliminated from this tournament': 'You have been eliminated from this tournament.',
  'buybacks are only available during normal rounds': 'Buybacks are only available during the regular rounds.',
  'only eliminated players can buy back': 'Only eliminated players can buy back a life.',
  'round time has ended — buybacks are no longer available': 'This round has ended — buybacks are no longer available.',
  'request failed': GENERIC,
  'an unexpected error occurred': GENERIC,
};

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

function matchByPartialMessage(message: string): string | undefined {
  const normalized = normalizeMessage(message);
  for (const [key, friendly] of Object.entries(BY_MESSAGE)) {
    if (normalized.includes(key)) return friendly;
  }
  return undefined;
}

export function friendlyApiError(error: ApiError | null | undefined): string {
  if (!error?.message) return GENERIC;

  const byMessage = matchByPartialMessage(error.message);
  if (byMessage) return byMessage;

  if (error.code && BY_CODE[error.code]) {
    return BY_CODE[error.code]!;
  }

  if (/^[A-Z_]+$/.test(error.message) || error.message.includes('ECONNREFUSED')) {
    return GENERIC;
  }

  return error.message;
}

export class ApiClientError extends Error {
  readonly userMessage: string;

  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.userMessage = friendlyApiError({ code: code ?? 'UNKNOWN', message });
  }
}

export function getUserErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return err.userMessage;
  }
  if (err instanceof Error && err.message) {
    return matchByPartialMessage(err.message) ?? err.message;
  }
  return GENERIC;
}

type RegisterConflictField = 'email' | 'username';

export function getRegisterConflict(err: unknown): {
  field: RegisterConflictField;
  message: string;
} | null {
  if (!(err instanceof ApiClientError) || err.code !== 'CONFLICT') {
    return null;
  }

  const details = err.details as { field?: RegisterConflictField } | undefined;
  if (details?.field === 'email') {
    return {
      field: 'email',
      message: 'This email is already registered. Try signing in instead.',
    };
  }
  if (details?.field === 'username') {
    return {
      field: 'username',
      message: 'This username is already taken. Please choose another.',
    };
  }

  const message = getUserErrorMessage(err).toLowerCase();
  if (message.includes('email')) {
    return {
      field: 'email',
      message: 'This email is already registered. Try signing in instead.',
    };
  }
  if (message.includes('username')) {
    return {
      field: 'username',
      message: 'This username is already taken. Please choose another.',
    };
  }

  return null;
}
