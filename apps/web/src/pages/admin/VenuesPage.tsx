import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Venue } from '@vr-tournament/shared';
import {
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

export function AdminVenuesPage() {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');

  const list = useAdminList<Venue>({
    queryKey: ['admin', 'venues'],
    path: '/admin/venues',
    filters: {
      search: search || undefined,
      active: active === '' ? undefined : active === 'true',
    },
  });

  return (
    <div>
      <AdminPageHeader
        title="Venues"
        description="VR arenas and slot management"
        actions={
          <Link to="/admin/venues/new">
            <Button size="sm">Add venue</Button>
          </Link>
        }
      />

      <AdminFilterBar>
        <AdminFilterField label="Search" className="min-w-[200px] flex-1">
          <AdminFilterSearch value={search} onChange={setSearch} placeholder="Name or city…" />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <AdminFilterSelect
            value={active}
            onChange={setActive}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      {list.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'city', label: 'City' },
              { key: 'capacity', label: 'Capacity' },
              { key: 'active', label: 'Status' },
            ]}
            rows={list.items.map((v) => ({
              name: (
                <Link to={`/admin/venues/${v.id}`} className="font-medium hover:underline">
                  {v.name}
                </Link>
              ),
              city: `${v.city}, ${v.country}`,
              capacity: v.capacity,
              active: v.active ? (
                <StatusPill status="active" />
              ) : (
                <span className="text-xs text-[var(--color-muted-foreground)]">Inactive</span>
              ),
            }))}
            emptyMessage="No venues match your filters"
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
