import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@vr-tournament/shared';
import { AppError } from '../lib/response.js';

const ADMIN_ROLES: UserRole[] = ['superadmin', 'venue_admin', 'tournament_admin'];

export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    }
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Admin access required', 403));
    }
    next();
  };
}

export function requireSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    }
    if (req.user.role !== 'superadmin') {
      return next(new AppError('FORBIDDEN', 'Superadmin access required', 403));
    }
    next();
  };
}

export function requireAdminRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    }
    if (req.user.role === 'superadmin') {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }
    next();
  };
}
