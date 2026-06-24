import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User, UserRole } from '@vr-tournament/shared';
import {
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAdminList } from '@/hooks/useAdminList';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'player', label: 'Player' },
  { value: 'venue_admin', label: 'Venue admin' },
  { value: 'tournament_admin', label: 'Tournament admin' },
  { value: 'superadmin', label: 'Superadmin' },
];

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const { user: currentUser } = useAuthUser();
  const isSuperAdmin = currentUser?.role === 'superadmin';

  const list = useAdminList<User>({
    queryKey: ['admin', 'users'],
    path: '/admin/users',
    filters: { search: search || undefined, role: role || undefined },
  });

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description="Players and admin accounts"
        actions={
          isSuperAdmin ? (
            <Link to="/admin/users/new">
              <Button size="sm">Create user</Button>
            </Link>
          ) : undefined
        }
      />

      <AdminFilterBar>
        <AdminFilterField label="Search" className="min-w-[220px] flex-1">
          <AdminFilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Email or username…"
          />
        </AdminFilterField>
        <AdminFilterField label="Role">
          <AdminFilterSelect value={role} onChange={setRole} options={ROLES} />
        </AdminFilterField>
      </AdminFilterBar>

      {list.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'username', label: 'Username' },
              { key: 'email', label: 'Email' },
              { key: 'role', label: 'Role' },
              { key: 'tier', label: 'Tier' },
              { key: 'rating', label: 'Rating' },
              { key: 'city', label: 'City' },
            ]}
            rows={list.items.map((u) => ({
              username: (
                <Link to={`/admin/users/${u.id}`} className="font-medium hover:underline">
                  {u.username}
                </Link>
              ),
              email: u.email,
              role: u.role,
              tier: u.skillTier,
              rating: u.ratingPoints ?? '—',
              city: u.city ?? '—',
            }))}
            emptyMessage="No users match your filters"
          />
          <AdminTableFooter
            count={list.items.length}
            pageIndex={list.pageIndex}
            limit={list.limit}
            canPrev={list.canPrev}
            canNext={list.canNext}
            isFetching={list.isFetching}
            onPrev={list.prevPage}
            onNext={list.nextPage}
            onLimitChange={list.setLimit}
          />
        </>
      )}
    </div>
  );
}
