import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { RoundDurationUnit, Tournament, TournamentStatus } from '@vr-tournament/shared';
import {
  minutesToRoundDurationParts,
  ROUND_DURATION_UNIT_OPTIONS,
} from '@vr-tournament/shared';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import {
  adminTournamentFormSchema,
  toTournamentApiBody,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError, AdminSkillTierSelect } from '@/components/admin/AdminUi';
import { TournamentFlowGuide } from '@/components/admin/TournamentFlowGuide';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';

const defaultForm: {
  name: string;
  game: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  maxPlayers: string;
  skillTier: string;
  buybackPriceCents: string;
  roundDurationValue: string;
  roundDurationUnit: RoundDurationUnit;
} = {
  name: '',
  game: 'VR Cricket',
  startDate: '',
  endDate: '',
  status: 'draft',
  maxPlayers: '',
  skillTier: '3',
  buybackPriceCents: '500',
  roundDurationValue: '2',
  roundDurationUnit: 'days',
};

const selectClass =
  'w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm';

export function AdminTournamentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState(defaultForm);

  const { data: tournament } = useQuery({
    queryKey: ['admin', 'tournament', id],
    queryFn: () => apiGet<Tournament>(`/admin/tournaments/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (tournament) {
      const duration = minutesToRoundDurationParts(tournament.roundDurationMinutes);
      setForm({
        name: tournament.name,
        game: tournament.game,
        startDate: tournament.startDate.slice(0, 16),
        endDate: tournament.endDate.slice(0, 16),
        status: tournament.status,
        maxPlayers: tournament.maxPlayers?.toString() ?? '',
        skillTier: String(tournament.skillTier),
        buybackPriceCents: String(tournament.buybackPriceCents),
        roundDurationValue: duration.value,
        roundDurationUnit: duration.unit,
      });
    }
  }, [tournament]);

  const save = useMutation({
    mutationFn: async (body: ReturnType<typeof toTournamentApiBody>) => {
      if (isEdit) return apiPatch<Tournament>(`/admin/tournaments/${id}`, body);
      return apiPost<Tournament>('/admin/tournaments', body);
    },
    onSuccess: (t) => navigate(`/admin/tournaments/${t.id}`),
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      delete next.roundDurationValue;
      delete next.roundDurationUnit;
      return next;
    });
  };

  const handleSubmit = () => {
    const result = validateAdminForm(adminTournamentFormSchema, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(toTournamentApiBody(result.data));
  };

  return (
    <div>
      <AdminPageHeader
        title={isEdit ? 'Edit tournament' : 'Create tournament'}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] items-start">
        <AdminCard className="p-6 space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
            <AdminFieldError message={errors.name} />
          </div>
          <div>
            <Label>Game</Label>
            <Input value={form.game} onChange={(e) => set('game', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.game} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
              <AdminFieldError message={errors.startDate} />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
              <AdminFieldError message={errors.endDate} />
            </div>
          </div>
          <div>
            <Label>Normal round duration</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <Input
                type="number"
                min={1}
                value={form.roundDurationValue}
                onChange={(e) => set('roundDurationValue', e.target.value)}
              />
              <select
                className={selectClass}
                value={form.roundDurationUnit}
                onChange={(e) => set('roundDurationUnit', e.target.value)}
              >
                {ROUND_DURATION_UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              How long each normal round runs before it closes and winners advance (e.g. 2 days).
            </p>
            <AdminFieldError message={errors.roundDurationValue || errors.roundDurationUnit} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max players</Label>
              <Input
                type="number"
                min={1}
                value={form.maxPlayers}
                onChange={(e) => set('maxPlayers', e.target.value)}
                placeholder="Optional"
              />
              <AdminFieldError message={errors.maxPlayers} />
            </div>
            <div>
              <Label>Skill tier</Label>
              <AdminSkillTierSelect value={form.skillTier} onChange={(v) => set('skillTier', v)} />
              <AdminFieldError message={errors.skillTier} />
            </div>
          </div>
          <div>
            <Label>Buyback price (cents)</Label>
            <Input
              type="number"
              min={0}
              value={form.buybackPriceCents}
              onChange={(e) => set('buybackPriceCents', e.target.value)}
            />
            <AdminFieldError message={errors.buybackPriceCents} />
          </div>
          <div>
            <Label>Status</Label>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => set('status', e.target.value as TournamentStatus)}
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
            <AdminFieldError message={errors.status} />
          </div>
          <Button onClick={handleSubmit} disabled={save.isPending}>
            {isEdit ? 'Save changes' : 'Create tournament'}
          </Button>
        </AdminCard>

        <AdminCard className="p-6 lg:sticky lg:top-6">
          <TournamentFlowGuide />
        </AdminCard>
      </div>
    </div>
  );
}
