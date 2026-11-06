import { useQueryClient } from '@tanstack/react-query';
import type { MatchFoundEvent } from '@vr-tournament/shared';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Target } from 'lucide-react';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { formatDateTime, formatTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface MatchFoundModalProps {
  match: MatchFoundEvent;
  onClose: () => void;
}

export function MatchFoundModal({ match, onClose }: MatchFoundModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const autoConfirmed = match.autoConfirmed ?? false;

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
    onClose();
  };

  const viewMatch = () => {
    handleClose();
    navigate('/matches');
  };

  return (
    <Modal open title={autoConfirmed ? 'Your match is ready' : 'Match found!'} onClose={handleClose} className="max-w-md">
      <p className="mb-2">
        Opponent:{' '}
        <Link to={`/players/${match.opponent.username}`} onClick={handleClose} className="font-semibold hover:underline">
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

      {match.slot && <p className="text-sm mb-4">{formatDateTime(match.slot.startTime)}</p>}

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
          Confirm by {formatTime(match.confirmDeadline)} on the Matches page.
        </p>
      )}

      <Button className="w-full" onClick={viewMatch}>
        View match
      </Button>
    </Modal>
  );
}
