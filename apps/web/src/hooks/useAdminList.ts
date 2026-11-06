import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGetList, type ListQueryParams } from '@/lib/api';

const DEFAULT_LIMIT = 20;

export function useAdminList<T>({
  queryKey,
  path,
  filters = {},
  limit: limitProp,
}: {
  queryKey: string[];
  path: string;
  filters?: ListQueryParams;
  limit?: number;
}) {
  const [limit, setLimit] = useState(limitProp ?? DEFAULT_LIMIT);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const pagingKey = `${filterKey}|${limit}`;
  const [paging, setPaging] = useState({ key: pagingKey, pageIndex: 0, cursors: [undefined] as (string | undefined)[] });
  // New filters reset paging in the same render, so no request goes out with a stale cursor.
  const current = paging.key === pagingKey ? paging : { key: pagingKey, pageIndex: 0, cursors: [undefined] };
  const { pageIndex, cursors } = current;

  const cursor = cursors[pageIndex];

  const query = useQuery({
    queryKey: [...queryKey, filters, limit, cursor],
    queryFn: () => apiGetList<T>(path, { ...filters, limit, cursor }),
  });

  const items = query.data?.items ?? [];
  const nextCursor = query.data?.meta.cursor ?? null;
  const canNext = !!nextCursor;
  const canPrev = pageIndex > 0;

  const nextPage = () => {
    if (!nextCursor) return;
    setPaging({ key: pagingKey, pageIndex: pageIndex + 1, cursors: [...cursors.slice(0, pageIndex + 1), nextCursor] });
  };

  const prevPage = () => {
    if (pageIndex > 0) setPaging({ key: pagingKey, pageIndex: pageIndex - 1, cursors });
  };

  const resetPage = () => setPaging({ key: pagingKey, pageIndex: 0, cursors: [undefined] });

  return {
    items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    limit,
    setLimit,
    pageIndex,
    canNext,
    canPrev,
    nextPage,
    prevPage,
    resetPage,
    refetch: query.refetch,
  };
}
