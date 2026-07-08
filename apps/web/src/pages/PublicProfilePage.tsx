import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Match, PublicPlayerProfile } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Badge, matchStatusBadge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/cricket-loader';
import { MapPin, Headset, BarChart3, Trophy, Swords } from 'lucide-react';
import { API_URL } from '@/lib/config';

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => apiGet<PublicPlayerProfile>(`/players/${username}`),
    enabled: !!username,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['public-matches', username],
    queryFn: () => apiGet<Match[]>(`/players/${username}/matches`),
    enabled: !!username,
  });

  if (isLoading || !profile) return <PageLoader label="Loading player…" />;

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

      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--color-primary)]" />
          Match history
        </h2>
        {matches.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No completed matches yet.</p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const isP1 = m.player1Id === profile.id;
              const opponent = isP1 ? m.player2 : m.player1;
              const won = m.result?.winnerId === profile.id;
              const badge = matchStatusBadge(m.status);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {won && m.status === 'completed' && (
                      <Trophy className="h-4 w-4 text-[var(--color-primary)] shrink-0" />
                    )}
                    <span>
                      vs{' '}
                      <Link to={`/players/${opponent?.username}`} className="font-medium hover:underline">
                        {opponent?.username ?? '—'}
                      </Link>
                    </span>
                    {m.result && (
                      <span className="text-[var(--color-muted-foreground)]">
                        ({m.result.player1Score}–{m.result.player2Score})
                      </span>
                    )}
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
