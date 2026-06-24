import { useQuery } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet, getAccessToken } from '@/lib/api';

const ADMIN_ROLES = ['superadmin', 'venue_admin', 'tournament_admin'];

export function useAuthUser() {
  const isLoggedIn = !!getAccessToken();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<User>('/players/me'),
    enabled: isLoggedIn,
    staleTime: 60_000,
  });

  const isAdmin = query.data ? ADMIN_ROLES.includes(query.data.role) : false;

  return {
    user: query.data,
    isLoggedIn,
    isAdmin,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function isAdminRole(role: string) {
  return ADMIN_ROLES.includes(role);
}
