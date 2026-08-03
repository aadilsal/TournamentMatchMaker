import type { UserRole } from '@vr-tournament/shared';

/**
 * Which admin sections each admin role may reach. Single source of truth for
 * both the sidebar (what is shown) and AdminGuard (what is reachable by URL),
 * so a scoped admin can no longer deep-link into a page they cannot use.
 *
 * Mirrors the API's own scoping in apps/api/src/middleware/admin-scope.ts.
 */
const ROLE_SECTIONS: Record<Exclude<UserRole, 'player'>, string[] | 'all'> = {
  superadmin: 'all',
  venue_admin: ['/admin', '/admin/venues', '/admin/bookings'],
  tournament_admin: [
    '/admin',
    '/admin/matches',
    '/admin/tournaments',
    '/admin/queue',
    '/admin/buybacks',
    '/admin/notifications',
  ],
};

export function allowedAdminSections(role?: UserRole): string[] | 'all' {
  if (!role || role === 'player') return [];
  return ROLE_SECTIONS[role] ?? [];
}

/** True when `role` may view `pathname` (exact match on /admin, prefix otherwise). */
export function canAccessAdminPath(pathname: string, role?: UserRole): boolean {
  const sections = allowedAdminSections(role);
  if (sections === 'all') return true;
  return sections.some((section) =>
    section === '/admin' ? pathname === '/admin' : pathname.startsWith(section)
  );
}
