import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, sendError } from '../lib/response.js';

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

  // Postgres unique constraint violation → user is already registered
  if ((err as { code?: string }).code === '23505') {
    return sendError(res, { code: 'CONFLICT', message: 'You are already registered for this tournament' }, 409);
  }

  console.error('Unhandled error:', err);
  return sendError(res, { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }, 500);
}
