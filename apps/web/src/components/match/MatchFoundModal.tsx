import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MatchFoundEvent } from '@vr-tournament/shared';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';

interface MatchFoundModalProps {
  match: MatchFoundEvent;
  onClose: () => void;
}

export function MatchFoundModal({ match, onClose }: MatchFoundModalProps) {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: () => apiPost(`/matches/${match.matchId}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      onClose();
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => apiPost(`/matches/${match.matchId}/decline`, { requeue: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">Match Found!</h2>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2">
          Opponent:{' '}
          <Link to={`/players/${match.opponent.username}`} className="font-semibold hover:underline">
            {match.opponent.username}
          </Link>{' '}
          (Tier {match.opponent.skillTier})
        </p>

        {match.venue ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] mb-2">
            <MapPin className="h-4 w-4" />
            {match.venue.name}, {match.venue.city}
          </p>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)] mb-2">Remote VR match</p>
        )}

        {match.slot && (
          <p className="text-sm mb-4">
            {new Date(match.slot.startTime).toLocaleString()}
          </p>
        )}

        <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
          Confirm by {new Date(match.confirmDeadline).toLocaleTimeString()}
        </p>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
            Confirm
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => declineMutation.mutate()} disabled={declineMutation.isPending}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
