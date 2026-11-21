import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tournament } from '@vr-tournament/shared';
import { DEFAULT_OVERS, MAX_OVERS, MIN_OVERS, OVERS_PRESETS, estimatedDrawFinish, roundsRemaining } from '@vr-tournament/shared';
import { cn } from '@/lib/utils';
import { apiPatch, apiPost } from '@/lib/api';
import { AdminCard, AdminFieldError, AdminPageHeader } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { centsToDollars, dollarsToCents, formatDateTime, toDateTimeLocal } from '@/lib/format';
import { formatRoundLength } from '@/lib/journey';

const ROUND_LENGTHS = [30, 60, 120, 180, 360, 720, 1440, 2880, 4320, 10080];

/** New-format tournament: five fields; registration closes at the start and the end date is calculated. */
export function DrawTournamentForm({ tournament }: { tournament?: Tournament }) {
  const navigate = useNavigate();
  const editing = !!tournament;
  const locked = !!tournament && !['draft', 'open'].includes(tournament.status);
  const [name, setName] = useState(tournament?.name ?? '');
  const [start, setStart] = useState(tournament ? toDateTimeLocal(tournament.startDate) : '');
  const [roundMinutes, setRoundMinutes] = useState(String(tournament?.roundDurationMinutes ?? 180));
  const [maxPlayers, setMaxPlayers] = useState(tournament?.maxPlayers ? String(tournament.maxPlayers) : '');
  const [buyback, setBuyback] = useState(centsToDollars(tournament?.buybackPriceCents ?? 500));
  const [overs, setOvers] = useState(String(tournament?.overs ?? DEFAULT_OVERS));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const minutes = Number(roundMinutes);
  const fieldSize = maxPlayers ? Number(maxPlayers) : 64;
  const startDate = start ? new Date(start) : null;
  const validStart = !!startDate && !Number.isNaN(startDate.getTime());
  const lengths = ROUND_LENGTHS.includes(minutes) ? ROUND_LENGTHS : [...ROUND_LENGTHS, minutes].sort((a, b) => a - b);

  const save = useAdminMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? apiPatch<Tournament>(`/admin/tournaments/${tournament!.id}`, body) : apiPost<Tournament>('/admin/tournaments', body),
    successMessage: editing ? 'Tournament saved.' : 'Tournament created as a draft — publish it when you are ready.',
    invalidate: [['admin', 'tournaments'], ['admin', 'tournament', tournament?.id]],
    onSuccess: (saved: Tournament) => navigate(`/admin/tournaments/${saved.id}`),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give the tournament a name';
    if (!validStart) errs.startDate = 'Pick a start date and time';
    else if (startDate!.getTime() <= Date.now()) errs.startDate = 'The start must be in the future';
    const max = Number(maxPlayers);
    if (maxPlayers && (!Number.isInteger(max) || max < 2 || max > 512)) errs.maxPlayers = 'Between 2 and 512, or leave empty for no limit';
    const cents = dollarsToCents(buyback || '0');
    if (cents === null || (cents !== 0 && cents < 50)) errs.buyback = 'Enter 0 to turn buybacks off, or at least 0.50';
    const oversNum = Number(overs);
    if (!Number.isInteger(oversNum) || oversNum < MIN_OVERS || oversNum > MAX_OVERS) errs.overs = `Between ${MIN_OVERS} and ${MAX_OVERS} overs`;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const iso = startDate!.toISOString();
    const common = {
      name: name.trim(),
      startDate: iso,
      roundDurationMinutes: minutes,
      overs: oversNum,
      buybackPriceCents: cents,
      ...(maxPlayers ? { maxPlayers: max } : {}),
    };
    save.mutate(
      editing
        ? { ...common, registrationClosesAt: iso, endDate: estimatedDrawFinish(iso, minutes, fieldSize).toISOString() }
        : { playFormat: 'draw', ...common }
    );
  };

  return (
    <div>
      <AdminPageHeader
        title={editing ? `Edit ${tournament!.name}` : 'New tournament'}
        description="Players join with a venue or from Home. Each round, everyone gets one opponent and plays any time before the round closes."
      />
      <AdminCard className="p-5 max-w-2xl">
        {locked ? (
          <p className="text-sm">This tournament has started, so its settings are locked.</p>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Super Over Cup" aria-invalid={!!errors.name} />
              <AdminFieldError message={errors.name} />
            </div>
            <div>
              <Label htmlFor="t-start">Starts</Label>
              <Input id="t-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.startDate} />
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Players can join until this moment. Round 1 is drawn automatically when it arrives.</p>
              <AdminFieldError message={errors.startDate} />
            </div>
            <div>
              <Label htmlFor="t-round">Each round lasts</Label>
              <Select id="t-round" value={roundMinutes} onChange={(e) => setRoundMinutes(e.target.value)}>
                {lengths.map((m) => (
                  <option key={m} value={m}>{formatRoundLength(m)}</option>
                ))}
              </Select>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">How long players have to play each match.</p>
            </div>
            <div>
              <Label htmlFor="t-overs">Overs per innings</Label>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {OVERS_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setOvers(String(n))}
                    aria-pressed={overs === String(n)}
                    className={cn(
                      'h-9 min-w-12 rounded-full border px-4 text-sm font-medium transition-colors',
                      overs === String(n)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/60'
                    )}
                  >
                    {n}
                  </button>
                ))}
                <Input
                  id="t-overs"
                  inputMode="numeric"
                  className="w-24"
                  value={overs}
                  onChange={(e) => setOvers(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  aria-label="Custom overs"
                  aria-invalid={!!errors.overs}
                />
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                Pick one or type any number from {MIN_OVERS} to {MAX_OVERS}. Every match in every round uses the same overs; this locks when the tournament starts.
              </p>
              <AdminFieldError message={errors.overs} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="t-max">Max players (optional)</Label>
                <Input id="t-max" inputMode="numeric" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} placeholder="No limit" aria-invalid={!!errors.maxPlayers} />
                <AdminFieldError message={errors.maxPlayers} />
              </div>
              <div>
                <Label htmlFor="t-buyback">Buyback price ($)</Label>
                <Input id="t-buyback" inputMode="decimal" value={buyback} onChange={(e) => setBuyback(e.target.value)} aria-invalid={!!errors.buyback} />
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Round 1 only. 0 turns buybacks off.</p>
                <AdminFieldError message={errors.buyback} />
              </div>
            </div>

            {validStart && (
              <p className="text-sm rounded-md bg-[var(--color-muted)] p-3">
                With {maxPlayers || 'up to 64'} players: about {Math.max(1, roundsRemaining(fieldSize))} rounds, finishing around{' '}
                <strong>{formatDateTime(estimatedDrawFinish(startDate!, minutes, fieldSize))}</strong>.
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create tournament'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            </div>
          </form>
        )}
      </AdminCard>
    </div>
  );
}
