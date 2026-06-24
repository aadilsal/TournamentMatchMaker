import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Tournament, Venue } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import {
  adminMatchFormSchema,
  toAdminMatchInput,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError } from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export function AdminMatchFormPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [venueId, setVenueId] = useState('');

  const { data: tournaments = [] } = useQuery({
    queryKey: ['admin', 'tournaments'],
    queryFn: () => apiGet<Tournament[]>('/admin/tournaments'),
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['admin', 'venues'],
    queryFn: () => apiGet<Venue[]>('/admin/venues'),
  });

  const create = useMutation({
    mutationFn: (body: ReturnType<typeof toAdminMatchInput>) => apiPost<{ id: string }>('/admin/matches', body),
    onSuccess: (match) => navigate(`/admin/matches/${match.id}`),
  });

  const handleSubmit = () => {
    const payload = { player1Id, player2Id, tournamentId, venueId };
    const result = validateAdminForm(adminMatchFormSchema, payload);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    create.mutate(toAdminMatchInput(payload));
  };

  return (
    <div>
      <AdminPageHeader title="Create match" description="Manually pair two players" />

      <AdminCard className="p-6 max-w-xl space-y-4">
        <div>
          <UserPicker
            label="Player 1"
            value={player1Id}
            onChange={(id) => {
              setPlayer1Id(id);
              setErrors((e) => {
                const next = { ...e };
                delete next.player1Id;
                return next;
              });
            }}
          />
          <AdminFieldError message={errors.player1Id} />
        </div>
        <div>
          <UserPicker
            label="Player 2"
            value={player2Id}
            onChange={(id) => {
              setPlayer2Id(id);
              setErrors((e) => {
                const next = { ...e };
                delete next.player2Id;
                return next;
              });
            }}
          />
          <AdminFieldError message={errors.player2Id} />
        </div>
        <div>
          <Label className="text-xs">Tournament (optional)</Label>
          <select
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
          >
            <option value="">Casual / none</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Venue (optional)</Label>
          <select
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
          >
            <option value="">None</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={handleSubmit} disabled={create.isPending}>
          Create match
        </Button>
      </AdminCard>
    </div>
  );
}
