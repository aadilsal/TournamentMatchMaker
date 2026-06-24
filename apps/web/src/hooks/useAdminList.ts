import { useEffect, useMemo, useState } from 'react';
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
  const [pageIndex, setPageIndex] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    setPageIndex(0);
    setCursors([undefined]);
  }, [filterKey, limit]);

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
    setCursors((prev) => {
      const trimmed = prev.slice(0, pageIndex + 1);
      return [...trimmed, nextCursor];
    });
    setPageIndex((i) => i + 1);
  };

  const prevPage = () => {
    if (pageIndex > 0) setPageIndex((i) => i - 1);
  };

  const resetPage = () => {
    setPageIndex(0);
    setCursors([undefined]);
  };

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
