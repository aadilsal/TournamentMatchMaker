import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import type { UserRole } from '@vr-tournament/shared';
import { AppError } from '../lib/response.js';

export interface AdminScope {
  role: UserRole;
  venueIds: string[] | null;
  tournamentIds: string[] | null;
}

declare global {
  namespace Express {
    interface Request {
      adminScope?: AdminScope;
    }
  }
}

export function loadAdminScope(pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next();

    const role = req.user.role;
    if (role === 'superadmin') {
      req.adminScope = { role, venueIds: null, tournamentIds: null };
      return next();
    }

    if (role === 'venue_admin') {
      const r = await pool.query(`SELECT venue_id FROM venue_admins WHERE user_id = $1`, [
        req.user.sub,
      ]);
      req.adminScope = {
        role,
        venueIds: r.rows.map((row) => row.venue_id as string),
        tournamentIds: null,
      };
      return next();
    }

    if (role === 'tournament_admin') {
      const r = await pool.query(`SELECT tournament_id FROM tournament_admins WHERE user_id = $1`, [
        req.user.sub,
      ]);
      req.adminScope = {
        role,
        venueIds: null,
        tournamentIds: r.rows.map((row) => row.tournament_id as string),
      };
      return next();
    }

    req.adminScope = { role, venueIds: [], tournamentIds: [] };
    next();
  };
}

export function assertVenueAccess(scope: AdminScope | undefined, venueId: string) {
  if (!scope || scope.venueIds === null) return;
  if (!scope.venueIds.includes(venueId)) {
    throw new AppError('FORBIDDEN', 'No access to this venue', 403);
  }
}

export function guardVenueAccess(param = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertVenueAccess(req.adminScope, req.params[param] as string);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function assertTournamentAccess(scope: AdminScope | undefined, tournamentId: string) {
  if (!scope || scope.tournamentIds === null) return;
  if (!scope.tournamentIds.includes(tournamentId)) {
    throw new AppError('FORBIDDEN', 'No access to this tournament', 403);
  }
}

export function guardTournamentAccess(param = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertTournamentAccess(req.adminScope, req.params[param] as string);
      next();
    } catch (err) {
      next(err);
    }
  };
}
