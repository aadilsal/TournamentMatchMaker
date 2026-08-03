import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, sendError } from '../lib/response.js';

/**
 * Postgres only tells us which constraint was violated, so map the ones a user
 * can actually trigger. Anything unmapped gets a truthful generic message
 * rather than a confidently wrong one.
 */
function uniqueViolationMessage(err: Error): string {
  const constraint = (err as { constraint?: string }).constraint ?? '';
  if (constraint.includes('one_live_tournament')) {
    return 'You are already playing in another tournament — finish or withdraw from it first';
  }
  if (constraint.includes('tournament_registrations')) {
    return 'You are already registered for this tournament';
  }
  if (constraint.includes('tournament_participants')) {
    return 'You are already a participant in this tournament';
  }
  if (constraint.includes('bookings')) return 'You have already booked this slot';
  if (constraint.includes('email')) return 'This email is already registered';
  if (constraint.includes('username')) return 'This username is already taken';
  if (constraint.includes('time_slots')) return 'A slot already exists at this time for this venue';
  return 'That record already exists';
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return sendError(res, { code: err.code, message: err.message, details: err.details }, err.status);
  }

  if (err instanceof ZodError) {
    return sendError(
      res,
      { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err.flatten() },
      400
    );
  }

  // body-parser could not parse the request body as JSON.
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return sendError(res, { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' }, 400);
  }

  const pgCode = (err as { code?: string }).code;

  // A malformed UUID (or other bad literal) reaching Postgres is a client
  // error, not a server fault — routes without a Zod-validated param land here.
  if (pgCode === '22P02' || pgCode === '22003' || pgCode === '22007') {
    return sendError(res, { code: 'VALIDATION_ERROR', message: 'Invalid request data' }, 400);
  }

  // Unique violations are reported per-constraint. A generic message here used
  // to claim every collision was a duplicate tournament registration.
  if (pgCode === '23505') {
    return sendError(res, { code: 'CONFLICT', message: uniqueViolationMessage(err) }, 409);
  }

  // Referenced row is missing or still referenced elsewhere.
  if (pgCode === '23503') {
    return sendError(res, { code: 'CONFLICT', message: 'Referenced record is missing or still in use' }, 409);
  }

  if ((err as { type?: string }).type === 'entity.too.large') {
    return sendError(
      res,
      { code: 'PAYLOAD_TOO_LARGE', message: 'Image is too large. Please use a smaller file (max 2MB).' },
      413
    );
  }

  console.error('Unhandled error:', err);
  return sendError(res, { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, 500);
}
