import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Tournament } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy } from 'lucide-react';

export function TournamentsPage() {
  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const res = await apiGet<Tournament[]>('/tournaments');
      return res;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Trophy className="h-8 w-8 text-[var(--color-primary)]" />
        Tournaments
      </h1>

      {isLoading && <p>Loading...</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {tournaments.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>{t.name}</CardTitle>
              <CardDescription>
                {t.game} · {t.format.replace(/_/g, ' ')} · {t.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {new Date(t.startDate).toLocaleDateString()} — {new Date(t.endDate).toLocaleDateString()}
              </p>
              <p className="text-sm">
                {t.registrationCount ?? 0}
                {t.maxPlayers ? ` / ${t.maxPlayers}` : ''} registered
              </p>
              <Link to={`/tournaments/${t.id}`}>
                <Button size="sm">View</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
