import { useQueryClient } from '@tanstack/react-query';
import type { MatchFoundEvent } from '@vr-tournament/shared';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { MapPin, Target, X } from 'lucide-react';

interface MatchFoundModalProps {
  match: MatchFoundEvent;
  onClose: () => void;
}

export function MatchFoundModal({ match, onClose }: MatchFoundModalProps) {
  const queryClient = useQueryClient();
  const autoConfirmed = match.autoConfirmed ?? false;

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{autoConfirmed ? 'Your Match Is Ready' : 'Match Found!'}</h2>
          <button onClick={handleClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
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

        {match.chaseTarget != null && (
          <p className="flex items-center gap-2 text-sm mb-4 text-[var(--color-primary)]">
            <Target className="h-4 w-4" />
            {match.amChasing
              ? `Score to beat: ${match.chaseTarget}`
              : `Your target on the line: ${match.chaseTarget}`}
          </p>
        )}

        {autoConfirmed ? (
          <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
            Head to your venue or VR headset — no confirmation needed.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
            Confirm by {new Date(match.confirmDeadline).toLocaleTimeString()} on the Matches page.
          </p>
        )}

        <Button className="w-full" onClick={handleClose}>
          {autoConfirmed ? 'Got it' : 'View match'}
        </Button>
      </div>
    </div>
  );
}
