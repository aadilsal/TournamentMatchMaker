import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  BookingUpdatedEvent,
  MatchFoundEvent,
  MatchUpdatedEvent,
  QueuePairFailedEvent,
  QueueUpdatedEvent,
  SlotUpdatedEvent,
} from '@vr-tournament/shared';
import { getAccessToken } from '@/lib/api';
import {
  invalidateLiveQueries,
  invalidateSlotQueries,
  LIVE_QUERY_KEYS,
} from '@/lib/query-keys';
import { connectSocket, disconnectSocket } from '@/hooks/useSocket';
import { MatchFoundModal } from '@/components/match/MatchFoundModal';

interface SocketSyncProviderProps {
  children: React.ReactNode;
}

export function SocketSyncProvider({ children }: SocketSyncProviderProps) {
  const queryClient = useQueryClient();
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAccessToken());
  const [matchModal, setMatchModal] = useState<MatchFoundEvent | null>(null);

  useEffect(() => {
    const syncAuth = () => setIsLoggedIn(!!getAccessToken());
    window.addEventListener('auth-changed', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('auth-changed', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();
    if (!socket) return;

    const onConnect = () => {
      invalidateLiveQueries(queryClient);
    };

    const onMatchFound = (data: MatchFoundEvent) => {
      setMatchModal(data);
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications });
    };

    const onMatchUpdated = (_data: MatchUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.buybackOptions });
    };

    const onQueueUpdated = (_data: QueueUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
    };

    const onQueueJoined = () => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
    };

    const onQueuePairFailed = (_data: QueuePairFailedEvent) => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
    };

    const onNotificationNew = () => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications });
    };

    const onSlotUpdated = (data: SlotUpdatedEvent) => {
      invalidateSlotQueries(queryClient, data.venueId, data.date);
    };

    const onBookingUpdated = (_data: BookingUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.bookings });
    };

    socket.on('connect', onConnect);
    socket.on('match:found', onMatchFound);
    socket.on('match:updated', onMatchUpdated);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('queue:joined', onQueueJoined);
    socket.on('queue:pair_failed', onQueuePairFailed);
    socket.on('notification:new', onNotificationNew);
    socket.on('slot:updated', onSlotUpdated);
    socket.on('booking:updated', onBookingUpdated);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('match:found', onMatchFound);
      socket.off('match:updated', onMatchUpdated);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('queue:joined', onQueueJoined);
      socket.off('queue:pair_failed', onQueuePairFailed);
      socket.off('notification:new', onNotificationNew);
      socket.off('slot:updated', onSlotUpdated);
      socket.off('booking:updated', onBookingUpdated);
    };
  }, [isLoggedIn, queryClient]);

  return (
    <>
      {children}
      {matchModal && (
        <MatchFoundModal match={matchModal} onClose={() => setMatchModal(null)} />
      )}
    </>
  );
}
