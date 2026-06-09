import type { Response } from 'express';
import type { ApiError, ApiMeta } from '@vr-tournament/shared';

export function sendSuccess<T>(res: Response, data: T, meta: ApiMeta = {}, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    error: null,
    meta,
  });
}

export function sendError(
  res: Response,
  error: ApiError,
  status = 400,
  meta: ApiMeta = {}
) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    meta,
  });
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
