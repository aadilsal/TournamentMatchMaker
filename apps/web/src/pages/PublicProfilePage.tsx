import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PublicPlayerProfile } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { ProfileSkeleton } from '@/components/ui/route-fallback';
import { ListSkeleton } from '@/components/ui/skeleton';
import { PlayerMatchHistory } from '@/components/player/PlayerMatchHistory';
import { PlayerTournamentHistory } from '@/components/player/PlayerTournamentHistory';
import { MapPin, Headset, BarChart3 } from 'lucide-react';
import { API_URL } from '@/lib/config';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => apiGet<PublicPlayerProfile>(`/players/${username}`),
    enabled: !!username,
  });

  if (isLoading || !profile) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <ProfileSkeleton />
        <ListSkeleton count={4} />
      </div>
    );
  }

  const avatarUrl = profile.hasProfilePicture
    ? `${API_URL}/api/v1/players/${profile.username}/avatar?v=${encodeURIComponent(profile.updatedAt)}`
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-24 w-24 rounded-full object-cover border-2 border-[var(--color-primary)]/30"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-3xl font-bold text-[var(--color-primary)]">
              {profile.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <h1 className="text-3xl font-bold">{profile.username}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--color-muted-foreground)]">
            {profile.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </span>
            )}
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Tier {profile.skillTier}
            </span>
            {profile.hasVrHeadset && (
              <span className="flex items-center gap-1">
                <Headset className="h-3.5 w-3.5" />
                {profile.vrDeviceType ?? 'VR'}
              </span>
            )}
          </div>
          <div className="flex gap-4 pt-2 text-sm">
            <span>
              <strong className="text-[var(--color-foreground)]">{profile.totalWins}</strong> wins
            </span>
            <span>
              <strong className="text-[var(--color-foreground)]">{profile.totalLosses}</strong> losses
            </span>
            <span>
              <strong className="text-[var(--color-foreground)]">{profile.totalMatches}</strong> matches
            </span>
          </div>
        </div>
      </div>

      <PlayerTournamentHistory username={profile.username} />

      <PlayerMatchHistory username={profile.username} playerId={profile.id} />
    </div>
  );
}
