import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import type { UserRole } from '@vr-tournament/shared';
import { AppError } from '../lib/response.js';

export interface AdminScope {
  role: UserRole;
  /** `null` means unrestricted (superadmin only); `[]` means access to none. */
  venueIds: string[] | null;
  /** `null` means unrestricted (superadmin only); `[]` means access to none. */
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

    // The *other* dimension is `[]`, not `null`. `null` means "unrestricted",
    // so leaving a venue_admin's tournamentIds null made every tournament guard
    // wave them through — a venue admin could publish, start and complete any
    // tournament in the system, and a tournament admin could edit any venue.
    if (role === 'venue_admin') {
      const r = await pool.query(`SELECT venue_id FROM venue_admins WHERE user_id = $1`, [
        req.user.sub,
      ]);
      req.adminScope = {
        role,
        venueIds: r.rows.map((row) => row.venue_id as string),
        tournamentIds: [],
      };
      return next();
    }

    if (role === 'tournament_admin') {
      const r = await pool.query(`SELECT tournament_id FROM tournament_admins WHERE user_id = $1`, [
        req.user.sub,
      ]);
      req.adminScope = {
        role,
        venueIds: [],
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

/** A superadmin has no venue/tournament restriction at all. */
function isUnscoped(scope: AdminScope | undefined): boolean {
  return !scope || (scope.venueIds === null && scope.tournamentIds === null);
}

/**
 * Slots, matches, bookings, participants and buybacks don't carry a venue or
 * tournament in the URL — they belong to one. Resolving the owner keeps those
 * routes inside the caller's scope instead of leaving them globally writable.
 */
export function guardOwnedResource(
  pool: Pool,
  sql: string,
  param = 'id'
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (isUnscoped(req.adminScope)) return next();

      const id = req.params[param] as string;
      const result = await pool.query(sql, [id]);
      const row = result.rows[0];
      // Nothing to own means nothing to leak; let the handler return its 404.
      if (!row) return next();

      // Either owner is enough: a match at your venue is yours to manage even
      // though its tournament isn't, and vice versa. Requiring both would lock
      // a venue admin out of the matches actually played at their venue.
      const scope = req.adminScope!;
      const venueOk = !!row.venue_id && !!scope.venueIds?.includes(row.venue_id as string);
      const tournamentOk =
        !!row.tournament_id && !!scope.tournamentIds?.includes(row.tournament_id as string);

      if (!venueOk && !tournamentOk) {
        throw new AppError('FORBIDDEN', 'No access to this resource', 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const OWNER_SQL = {
  slot: `SELECT venue_id, NULL::uuid AS tournament_id FROM time_slots WHERE id = $1`,
  match: `SELECT venue_id, tournament_id FROM matches WHERE id = $1`,
  booking: `SELECT ts.venue_id, NULL::uuid AS tournament_id
            FROM bookings b JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
  participant: `SELECT NULL::uuid AS venue_id, tournament_id FROM tournament_participants WHERE id = $1`,
  buyback: `SELECT NULL::uuid AS venue_id, tournament_id FROM buybacks WHERE id = $1`,
  round: `SELECT NULL::uuid AS venue_id, tournament_id FROM tournament_rounds WHERE id = $1`,
} as const;
