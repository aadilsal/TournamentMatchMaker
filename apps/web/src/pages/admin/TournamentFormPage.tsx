import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Tournament, TournamentStatus } from '@vr-tournament/shared';
import {
  MAX_ROUND_DURATION_DAYS,
  MIN_ROUND_DURATION_DAYS,
  minutesToRoundDurationDays,
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_TRANSITIONS,
  allowedTournamentStatuses,
  isValidTournamentTransition,
  type TournamentStatusValue,
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
import { Select } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { useAdminMutation } from '@/hooks/useAdminMutation';

const defaultForm: {
  name: string;
  game: string;
  startDate: string;
  endDate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  status: TournamentStatus;
  maxPlayers: string;
  skillTier: string;
  buybackPriceCents: string;
  roundDurationDays: string;
} = {
  name: '',
  game: 'VR Cricket',
  startDate: '',
  endDate: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  status: 'draft',
  maxPlayers: '',
  skillTier: '3',
  buybackPriceCents: '500',
  roundDurationDays: '2',
};

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
      const roundDurationDays = minutesToRoundDurationDays(tournament.roundDurationMinutes);
      setForm({
        name: tournament.name,
        game: tournament.game,
        startDate: tournament.startDate.slice(0, 16),
        endDate: tournament.endDate.slice(0, 16),
        registrationOpensAt: tournament.registrationOpensAt?.slice(0, 16) ?? '',
        registrationClosesAt: tournament.registrationClosesAt?.slice(0, 16) ?? '',
        status: tournament.status,
        maxPlayers: tournament.maxPlayers?.toString() ?? '',
        skillTier: String(tournament.skillTier),
        buybackPriceCents: String(tournament.buybackPriceCents),
        roundDurationDays,
      });
    }
  }, [tournament]);

  const save = useAdminMutation({
    mutationFn: async (body: ReturnType<typeof toTournamentApiBody>) => {
      if (isEdit) return apiPatch<Tournament>(`/admin/tournaments/${id}`, body);
      return apiPost<Tournament>('/admin/tournaments', body);
    },
    successMessage: isEdit ? 'Tournament updated.' : 'Tournament created.',
    invalidate: [['admin', 'tournaments'], ['admin', 'tournament', id]],
    onSuccess: (t) => navigate(`/admin/tournaments/${t.id}`),
  });

  // The saved status is the transition source; without a loaded tournament (create
  // flow) a new tournament can only start as a draft.
  const currentStatus = (tournament?.status ?? 'draft') as TournamentStatusValue;
  const statusOptions: TournamentStatusValue[] = isEdit
    ? allowedTournamentStatuses(currentStatus)
    : ['draft'];

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      delete next.roundDurationDays;
      return next;
    });
  };

  const handleSubmit = () => {
    const result = validateAdminForm(adminTournamentFormSchema, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    // Defence in depth: the dropdown only offers legal moves, but a stale form
    // (tournament advanced in another tab) must not push an illegal transition.
    if (isEdit && !isValidTournamentTransition(currentStatus, result.data.status as TournamentStatusValue)) {
      setErrors({
        status: `Cannot move from ${TOURNAMENT_STATUS_LABELS[currentStatus]} to ${
          TOURNAMENT_STATUS_LABELS[result.data.status as TournamentStatusValue]
        }. Reload the page and use the tournament action bar.`,
      });
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
            <Label required>Name</Label>
            <Input aria-required="true" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
            <AdminFieldError message={errors.name} />
          </div>
          <div>
            <Label required>Game</Label>
            <Input aria-required="true" value={form.game} onChange={(e) => set('game', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.game} />
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Registration period</p>
            <p className="text-xs text-[var(--color-muted-foreground)] mb-2">
              The window before play begins when players can join. Registration
              closes and the tournament starts on their own — you can still do
              either early from the tournament page.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>Registration opens</Label>
                <Input
                  type="datetime-local"
                  aria-required="true"
                  value={form.registrationOpensAt}
                  onChange={(e) => set('registrationOpensAt', e.target.value)}
                />
                <AdminFieldError message={errors.registrationOpensAt} />
              </div>
              <div>
                <Label required>Registration closes</Label>
                <Input
                  type="datetime-local"
                  aria-required="true"
                  value={form.registrationClosesAt}
                  onChange={(e) => set('registrationClosesAt', e.target.value)}
                />
                <AdminFieldError message={errors.registrationClosesAt} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label required>Start</Label>
              <Input
                type="datetime-local"
                aria-required="true"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
              <AdminFieldError message={errors.startDate} />
            </div>
            <div>
              <Label required>End</Label>
              <Input
                type="datetime-local"
                aria-required="true"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
              <AdminFieldError message={errors.endDate} />
            </div>
          </div>
          <div>
            <Label required>Normal round duration (days)</Label>
            <div className="mt-1 flex items-center gap-3">
              <Input
                type="number"
                min={MIN_ROUND_DURATION_DAYS}
                max={MAX_ROUND_DURATION_DAYS}
                aria-label="Round duration in days"
                value={form.roundDurationDays}
                onChange={(e) => set('roundDurationDays', e.target.value)}
              />
              <span className="text-sm text-[var(--color-muted-foreground)]">days</span>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              How long each normal round runs before it closes and winners advance (e.g. 2 days).
              Rounds are set in whole days so every round is long enough to contain a playable slot.
            </p>
            <AdminFieldError message={errors.roundDurationDays} />
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
              <Label required>Skill tier</Label>
              <AdminSkillTierSelect value={form.skillTier} onChange={(v) => set('skillTier', v)} />
              <AdminFieldError message={errors.skillTier} />
            </div>
          </div>
          <div>
            <Label required>Buyback price (cents)</Label>
            <Input
              type="number"
              min={0}
              value={form.buybackPriceCents}
              onChange={(e) => set('buybackPriceCents', e.target.value)}
            />
            <AdminFieldError message={errors.buybackPriceCents} />
          </div>
          <div>
            <Label htmlFor="tournament-status">Status</Label>
            <Select
              id="tournament-status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as TournamentStatus)}
              disabled={statusOptions.length <= 1}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {TOURNAMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
              {isEdit
                ? currentStatus === 'completed'
                  ? 'This tournament is completed — its status can no longer change.'
                  : `Only the next step in the lifecycle is offered here. Use the action bar on the tournament page to ${TOURNAMENT_STATUS_TRANSITIONS[currentStatus].length ? 'advance it with the full explanation and confirmation' : 'manage it'}.`
                : 'New tournaments start as a draft and are published from the tournament page.'}
            </p>
            <AdminFieldError message={errors.status} />
          </div>
          <AdminFieldError message={errors._form} />
          <Button onClick={handleSubmit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create tournament'}
          </Button>
        </AdminCard>

        <AdminCard className="p-6 lg:sticky lg:top-6">
          <TournamentFlowGuide />
        </AdminCard>
      </div>
    </div>
  );
}
