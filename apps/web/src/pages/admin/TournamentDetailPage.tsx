import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Match,
  Tournament,
  TournamentBracket,
  TournamentParticipant,
  TournamentRegistration,
  TournamentRound,
} from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import {
  AdminQueryError,
  AdminPageHeader,
  AdminCard,
  AdminFieldError,
  PagedDataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { TournamentFlowGuide } from '@/components/admin/TournamentFlowGuide';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { GridSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { KnockoutBracket } from '@/components/tournament/KnockoutBracket';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  PARTICIPANT_STATUS_OPTIONS,
  adminParticipantFormSchema,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';

/** "in 2d 4h" / "overdue by 5m" — the worker sweeps for expired rounds every minute. */
function formatRoundCountdown(endsAt: string): string {
  const diffMs = new Date(endsAt).getTime() - Date.now();
  const overdue = diffMs < 0;
  const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    days === 0 && minutes > 0 ? `${minutes}m` : null,
  ].filter(Boolean);
  const label = parts.length > 0 ? parts.join(' ') : 'under a minute';

  return overdue ? `overdue by ${label} — closing shortly` : `in ${label}`;
}

export function AdminTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const askConfirm = useConfirm();
  const [tab, setTab] = useState('participants');
  const [showFlowGuide, setShowFlowGuide] = useState(false);
  const [participantErrors, setParticipantErrors] = useState<FieldErrors>({});
  const [roundErrors, setRoundErrors] = useState<FieldErrors>({});
  const [registerUserId, setRegisterUserId] = useState('');
  const [assignAdminUserId, setAssignAdminUserId] = useState('');
  const [editParticipantId, setEditParticipantId] = useState<string | null>(null);
  const [participantStatus, setParticipantStatus] = useState('active');
  const [participantWins, setParticipantWins] = useState('0');
  const [participantLosses, setParticipantLosses] = useState('0');
  const [participantRound, setParticipantRound] = useState('1');
  const [participantBuybacks, setParticipantBuybacks] = useState('0');
  const [editRoundId, setEditRoundId] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState('active');
  const [newRoundNumber, setNewRoundNumber] = useState('1');
  const [newRoundStart, setNewRoundStart] = useState('');
  const [newRoundEnd, setNewRoundEnd] = useState('');

  const { data: tournament, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'tournament', id],
    queryFn: () => apiGet<Tournament>(`/admin/tournaments/${id}`),
    enabled: !!id,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'participants'],
    queryFn: () => apiGet<TournamentParticipant[]>(`/admin/tournaments/${id}/participants`),
    enabled: !!id,
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'registrations'],
    queryFn: () =>
      apiGet<(TournamentRegistration & { username?: string; email?: string })[]>(
        `/admin/tournaments/${id}/registrations`
      ),
    enabled: !!id,
  });

  const { data: rounds = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'rounds'],
    queryFn: () => apiGet<TournamentRound[]>(`/admin/tournaments/${id}/rounds`),
    enabled: !!id,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'matches'],
    queryFn: () => apiGet<Match[]>(`/admin/tournaments/${id}/matches`),
    enabled: !!id && tab === 'matches',
  });

  const { data: bracket } = useQuery({
    queryKey: ['admin', 'tournament', id, 'bracket'],
    queryFn: () => apiGet<TournamentBracket>(`/admin/tournaments/${id}/bracket`),
    enabled: !!id && tab === 'bracket',
  });

  const { data: buybacks = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'buybacks'],
    queryFn: () =>
      apiGet<Array<{ id: string; username?: string; amountCents: number; status: string; roundNumber: number }>>(
        `/admin/tournaments/${id}/buybacks`
      ),
    enabled: !!id && tab === 'buybacks',
  });

  const { data: admins = [] } = useQuery({
    queryKey: ['admin', 'tournament', id, 'admins'],
    queryFn: () =>
      apiGet<Array<{ userId: string; username: string; email: string }>>(`/admin/tournaments/${id}/admins`),
    enabled: !!id,
  });

  const invalidate = [['admin', 'tournament', id]];
  const adminsKey = [['admin', 'tournament', id, 'admins']];

  const publish = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/publish`),
    successMessage: 'Tournament published — players can now register.',
    invalidate,
  });
  const closeReg = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/close-registration`),
    successMessage: 'Registration closed. No new players can join.',
    invalidate,
  });
  const start = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/start`),
    successMessage: 'Tournament started — round 1 is live.',
    invalidate,
  });
  const complete = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/complete`),
    successMessage: 'Tournament marked complete.',
    invalidate,
  });
  const closeRound = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/close-round`, {}),
    successMessage: 'Round closed. Winners have advanced to the next round.',
    invalidate,
  });
  const syncStats = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/participants/sync-stats`),
    successMessage: 'Participant win/loss stats resynced from match results.',
    invalidate,
  });

  const addRegistration = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/registrations`, { userId: registerUserId }),
    successMessage: 'Player registered.',
    invalidate,
    onSuccess: () => setRegisterUserId(''),
  });

  const removeRegistration = useAdminMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/tournaments/${id}/registrations/${userId}`),
    successMessage: 'Registration removed.',
    invalidate,
  });

  const updateParticipant = useAdminMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch(`/admin/participants/${editParticipantId}`, body),
    successMessage: 'Participant updated.',
    invalidate,
    onSuccess: () => setEditParticipantId(null),
  });

  const assignAdmin = useAdminMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/admins`, { userId: assignAdminUserId }),
    successMessage: 'Tournament admin assigned.',
    invalidate: adminsKey,
    onSuccess: () => setAssignAdminUserId(''),
  });

  const removeAdmin = useAdminMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/tournaments/${id}/admins/${userId}`),
    successMessage: 'Tournament admin removed.',
    invalidate: adminsKey,
  });

  const createRound = useAdminMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/admin/tournaments/${id}/rounds`, body),
    successMessage: 'Round created.',
    invalidate,
    onSuccess: () => {
      setNewRoundStart('');
      setNewRoundEnd('');
      setRoundErrors({});
    },
  });

  const updateRound = useAdminMutation({
    mutationFn: () => apiPatch(`/admin/rounds/${editRoundId}`, { status: roundStatus }),
    successMessage: 'Round updated.',
    invalidate,
    onSuccess: () => setEditRoundId(null),
  });

  if (isLoading) return <GridSkeleton count={4} />;
  if (error || !tournament)
    return <AdminQueryError error={error} resource="tournament" onRetry={() => refetch()} />;

  const activeCount = participants.filter((p) => p.status === 'active' || p.status === 'advanced').length;
  const activeRound = rounds.find(
    (r) => r.status === 'active' && r.roundNumber === tournament.currentRoundNumber
  );

  const handleLifecycle = async (
    action: 'publish' | 'closeReg' | 'start' | 'closeRound' | 'complete'
  ) => {
    const config = {
      publish: {
        mutation: publish,
        title: 'Publish this tournament?',
        description:
          'It becomes visible to players and opens for registration. You can still close registration later, but players will already have seen it.',
        confirmLabel: 'Publish',
        tone: 'default' as const,
      },
      closeReg: {
        mutation: closeReg,
        title: 'Close registration?',
        description: `No new players can join after this. ${tournament.registrationCount ?? 0} player(s) are currently registered. Reopening means editing the tournament back to open.`,
        confirmLabel: 'Close registration',
        tone: 'default' as const,
      },
      start: {
        mutation: start,
        title: 'Start the tournament?',
        description:
          'Round 1 goes live, players can queue for matches, and the round deadline starts counting down. This cannot be undone.',
        confirmLabel: 'Start tournament',
        tone: 'default' as const,
      },
      closeRound: {
        mutation: closeRound,
        title: `Close round ${tournament.currentRoundNumber}?`,
        description: `Players with the best records advance and the rest are eliminated. ${activeCount} player(s) are still active. Any match still unplayed in this round is forfeited. This cannot be undone.`,
        confirmLabel: 'Close round',
        tone: 'danger' as const,
      },
      complete: {
        mutation: complete,
        title: 'Complete this tournament?',
        description:
          'The tournament is finished for good: no further rounds, matches, or buybacks. Final standings are locked in. This cannot be undone.',
        confirmLabel: 'Complete tournament',
        tone: 'danger' as const,
      },
    }[action];

    const ok = await askConfirm({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      tone: config.tone,
    });
    if (ok) config.mutation.mutate();
  };

  const handleRemoveRegistration = async (userId: string, username: string) => {
    const ok = await askConfirm({
      title: `Remove ${username} from this tournament?`,
      description:
        'Their registration is deleted. If the tournament has started this can leave the bracket uneven — you may need to resync stats afterwards.',
      confirmLabel: 'Remove registration',
    });
    if (ok) removeRegistration.mutate(userId);
  };

  const handleRemoveTournamentAdmin = async (userId: string, username: string) => {
    const ok = await askConfirm({
      title: `Remove ${username} as tournament admin?`,
      description: `They will lose the ability to manage ${tournament.name}.`,
      confirmLabel: 'Remove admin',
    });
    if (ok) removeAdmin.mutate(userId);
  };

  const handleSaveParticipant = () => {
    const result = validateAdminForm(adminParticipantFormSchema, {
      status: participantStatus,
      roundNumber: participantRound,
    });
    if (!result.ok) {
      setParticipantErrors(result.errors);
      return;
    }
    const numeric = { wins: participantWins, losses: participantLosses, buybackCount: participantBuybacks };
    const numericErrors: FieldErrors = {};
    for (const [key, value] of Object.entries(numeric)) {
      const n = parseInt(value, 10);
      if (!Number.isInteger(n) || n < 0) numericErrors[key] = 'Must be 0 or greater';
    }
    if (Object.keys(numericErrors).length > 0) {
      setParticipantErrors(numericErrors);
      return;
    }
    setParticipantErrors({});
    updateParticipant.mutate({
      status: result.data.status,
      wins: parseInt(participantWins, 10),
      losses: parseInt(participantLosses, 10),
      roundNumber: parseInt(result.data.roundNumber, 10),
      buybackCount: parseInt(participantBuybacks, 10),
    });
  };

  const handleCreateRound = () => {
    const errors: FieldErrors = {};
    const n = parseInt(newRoundNumber, 10);
    if (!Number.isInteger(n) || n < 1) errors.roundNumber = 'Round must be a whole number of at least 1';
    if (!newRoundStart) errors.startsAt = 'Start time is required';
    if (!newRoundEnd) errors.endsAt = 'End time is required';
    if (newRoundStart && newRoundEnd && new Date(newRoundEnd) <= new Date(newRoundStart)) {
      errors.endsAt = 'End must be after start';
    }
    if (rounds.some((r) => r.roundNumber === n)) {
      errors.roundNumber = `Round ${n} already exists`;
    }
    if (Object.keys(errors).length > 0) {
      setRoundErrors(errors);
      return;
    }
    setRoundErrors({});
    createRound.mutate({
      roundNumber: n,
      startsAt: new Date(newRoundStart).toISOString(),
      endsAt: new Date(newRoundEnd).toISOString(),
      status: 'active',
    });
  };

  return (
    <div>
      <AdminPageHeader
        title={tournament.name}
        description={`${tournament.game} · Round ${tournament.currentRoundNumber}`}
        actions={
          <>
            <Link to={`/admin/tournaments/${id}/edit`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
            <Link to="/admin/tournaments">
              <Button variant="outline" size="sm">← All</Button>
            </Link>
          </>
        }
      />

      <AdminCard className="p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <StatusBadge status={tournament.status} />
          <StatusBadge status={tournament.phase} />
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {tournament.registrationCount ?? 0} registered
          </span>
          <div className="flex flex-wrap gap-2 ml-auto">
            {tournament.status === 'draft' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLifecycle('publish')}
                disabled={publish.isPending}
              >
                {publish.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            )}
            {tournament.status === 'open' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLifecycle('closeReg')}
                disabled={closeReg.isPending}
              >
                {closeReg.isPending ? 'Closing…' : 'Close registration'}
              </Button>
            )}
            {tournament.status === 'closed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLifecycle('start')}
                disabled={start.isPending}
              >
                {start.isPending ? 'Starting…' : 'Start'}
              </Button>
            )}
            {tournament.status === 'in_progress' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLifecycle('closeRound')}
                  disabled={closeRound.isPending}
                >
                  {closeRound.isPending ? 'Closing round…' : 'Close round'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLifecycle('complete')}
                  disabled={complete.isPending}
                >
                  {complete.isPending ? 'Completing…' : 'Complete'}
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => syncStats.mutate()}
              disabled={syncStats.isPending}
            >
              {syncStats.isPending ? 'Syncing…' : 'Sync stats'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowFlowGuide((v) => !v)}
              aria-expanded={showFlowGuide}
            >
              {showFlowGuide ? 'Hide guide' : 'How this works'}
            </Button>
          </div>
        </div>

        {tournament.status === 'in_progress' && tournament.phase === 'normal' && (
          <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
            {activeRound ? (
              <>
                Round {activeRound.roundNumber} closes automatically at{' '}
                <strong className="text-[var(--color-foreground)]">
                  {new Date(activeRound.endsAt).toLocaleString()}
                </strong>{' '}
                ({formatRoundCountdown(activeRound.endsAt)}). Winners advance and the next round starts on
                its own — use <strong>Close round</strong> only to end it early.
              </>
            ) : (
              <>
                Rounds close automatically when their deadline passes. Use <strong>Close round</strong>{' '}
                only to end the current round early.
              </>
            )}
          </p>
        )}

        {showFlowGuide && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <TournamentFlowGuide />
          </div>
        )}
      </AdminCard>

      <AdminPageHeader title="Tournament admins" description="Users who can manage this tournament" />
      <AdminCard className="p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <UserPicker value={assignAdminUserId} onChange={setAssignAdminUserId} label="Assign admin" />
          </div>
          <Button
            size="sm"
            onClick={() => assignAdmin.mutate()}
            disabled={!assignAdminUserId || assignAdmin.isPending}
          >
            {assignAdmin.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
        {admins.length > 0 ? (
          <ul className="text-sm space-y-2">
            {admins.map((a) => (
              <li key={a.userId} className="flex justify-between items-center">
                <span>{a.username} ({a.email})</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() => handleRemoveTournamentAdmin(a.userId, a.username)}
                  disabled={removeAdmin.isPending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">No tournament admins assigned</p>
        )}
      </AdminCard>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'participants', label: `Participants (${participants.length})` },
          { id: 'registrations', label: `Registrations (${registrations.length})` },
          { id: 'matches', label: 'Matches' },
          { id: 'bracket', label: 'Bracket' },
          { id: 'rounds', label: `Rounds (${rounds.length})` },
          { id: 'buybacks', label: 'Buybacks' },
        ]}
      />

      {tab === 'participants' && (
        <PagedDataTable
          columns={[
            { key: 'user', label: 'Player' },
            { key: 'status', label: 'Status' },
            { key: 'record', label: 'W–L' },
            { key: 'round', label: 'Round' },
            { key: 'buybacks', label: 'Buybacks' },
            { key: 'actions', label: '' },
          ]}
          rows={participants.map((p) => ({
            user: p.username ?? p.userId.slice(0, 8),
            status: <StatusBadge status={p.status} />,
            record: `${p.wins}–${p.losses}`,
            round: p.roundNumber,
            buybacks: p.buybackCount,
            actions: (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditParticipantId(p.id);
                  setParticipantStatus(p.status);
                  setParticipantWins(String(p.wins));
                  setParticipantLosses(String(p.losses));
                  setParticipantRound(String(p.roundNumber));
                  setParticipantBuybacks(String(p.buybackCount));
                  setParticipantErrors({});
                }}
              >
                Edit
              </Button>
            ),
          }))}
          emptyMessage="No participants"
        />
      )}

      {tab === 'registrations' && (
        <>
          <AdminCard className="p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <UserPicker value={registerUserId} onChange={setRegisterUserId} label="Add player" />
            </div>
            <Button
              size="sm"
              onClick={() => addRegistration.mutate()}
              disabled={!registerUserId || addRegistration.isPending}
            >
              {addRegistration.isPending ? 'Registering…' : 'Register'}
            </Button>
          </AdminCard>
          <PagedDataTable
            columns={[
              { key: 'user', label: 'Player' },
              { key: 'email', label: 'Email' },
              { key: 'date', label: 'Registered' },
              { key: 'actions', label: '' },
            ]}
            rows={registrations.map((r) => ({
              user: r.username ?? r.userId.slice(0, 8),
              email: r.email ?? '—',
              date: new Date(r.registeredAt).toLocaleString(),
              actions: (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() =>
                    handleRemoveRegistration(r.userId, r.username ?? r.userId.slice(0, 8))
                  }
                  disabled={removeRegistration.isPending}
                >
                  Remove
                </Button>
              ),
            }))}
            emptyMessage="No registrations"
          />
        </>
      )}

      {tab === 'matches' && (
        <PagedDataTable
          columns={[
            { key: 'players', label: 'Players' },
            { key: 'status', label: 'Status' },
            { key: 'round', label: 'Round' },
          ]}
          rows={matches.map((m) => ({
            players: (
              <Link to={`/admin/matches/${m.id}`} className="hover:underline">
                {m.player1?.username} vs {m.player2?.username}
              </Link>
            ),
            status: <StatusBadge status={m.status} />,
            round: m.roundNumber ?? '—',
          }))}
          emptyMessage="No matches"
        />
      )}

      {tab === 'bracket' && bracket && (
        <AdminCard className="p-4">
          <KnockoutBracket rounds={bracket.rounds} />
        </AdminCard>
      )}

      {tab === 'rounds' && (
        <>
          <AdminCard className="p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs" htmlFor="new-round-number">Round #</Label>
              <input
                id="new-round-number"
                type="number"
                min={1}
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundNumber}
                onChange={(e) => {
                  setNewRoundNumber(e.target.value);
                  setRoundErrors((p) => ({ ...p, roundNumber: '' }));
                }}
                aria-invalid={Boolean(roundErrors.roundNumber)}
              />
              <AdminFieldError message={roundErrors.roundNumber} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="new-round-start">Starts</Label>
              <input
                id="new-round-start"
                type="datetime-local"
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundStart}
                onChange={(e) => {
                  setNewRoundStart(e.target.value);
                  setRoundErrors((p) => ({ ...p, startsAt: '', endsAt: '' }));
                }}
                aria-invalid={Boolean(roundErrors.startsAt)}
              />
              <AdminFieldError message={roundErrors.startsAt} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="new-round-end">Ends</Label>
              <input
                id="new-round-end"
                type="datetime-local"
                min={newRoundStart || undefined}
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundEnd}
                onChange={(e) => {
                  setNewRoundEnd(e.target.value);
                  setRoundErrors((p) => ({ ...p, endsAt: '' }));
                }}
                aria-invalid={Boolean(roundErrors.endsAt)}
              />
              <AdminFieldError message={roundErrors.endsAt} />
            </div>
            <div className="flex items-start pt-5">
              <Button size="sm" onClick={handleCreateRound} disabled={createRound.isPending}>
                {createRound.isPending ? 'Adding…' : 'Add round'}
              </Button>
            </div>
          </AdminCard>
          <PagedDataTable
            columns={[
              { key: 'round', label: 'Round' },
              { key: 'status', label: 'Status' },
              { key: 'starts', label: 'Starts' },
              { key: 'ends', label: 'Ends' },
              { key: 'actions', label: '' },
            ]}
            rows={rounds.map((r) => ({
              round: r.roundNumber,
              status: <StatusBadge status={r.status} />,
              starts: new Date(r.startsAt).toLocaleString(),
              ends: new Date(r.endsAt).toLocaleString(),
              actions: (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditRoundId(r.id);
                    setRoundStatus(r.status);
                  }}
                >
                  Edit
                </Button>
              ),
            }))}
            emptyMessage="No rounds"
          />
        </>
      )}

      {tab === 'buybacks' && (
        <PagedDataTable
          columns={[
            { key: 'user', label: 'Player' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'round', label: 'Round' },
          ]}
          rows={buybacks.map((b) => ({
            user: (
              <Link to={`/admin/buybacks/${b.id}`} className="hover:underline">
                {b.username ?? b.id.slice(0, 8)}
              </Link>
            ),
            amount: `$${(b.amountCents / 100).toFixed(2)}`,
            status: <StatusBadge status={b.status} />,
            round: b.roundNumber,
          }))}
          emptyMessage="No buybacks"
        />
      )}

      <Modal
        open={Boolean(editParticipantId)}
        title="Edit participant"
        onClose={() => setEditParticipantId(null)}
        busy={updateParticipant.isPending}
      >
        <div className="space-y-4">
            <div>
              <Label className="text-xs" htmlFor="participant-status">Status</Label>
              <Select
                id="participant-status"
                className="mt-1"
                value={participantStatus}
                onChange={(e) => {
                  setParticipantStatus(e.target.value);
                  setParticipantErrors((p) => ({ ...p, status: '' }));
                }}
                aria-invalid={Boolean(participantErrors.status)}
              >
                {PARTICIPANT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                {PARTICIPANT_STATUS_OPTIONS.find((o) => o.value === participantStatus)?.help}
              </p>
              <AdminFieldError message={participantErrors.status} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="participant-wins">Wins</Label>
                <input
                  id="participant-wins"
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantWins}
                  onChange={(e) => {
                    setParticipantWins(e.target.value);
                    setParticipantErrors((p) => ({ ...p, wins: '' }));
                  }}
                  aria-invalid={Boolean(participantErrors.wins)}
                />
                <AdminFieldError message={participantErrors.wins} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="participant-losses">Losses</Label>
                <input
                  id="participant-losses"
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantLosses}
                  onChange={(e) => {
                    setParticipantLosses(e.target.value);
                    setParticipantErrors((p) => ({ ...p, losses: '' }));
                  }}
                  aria-invalid={Boolean(participantErrors.losses)}
                />
                <AdminFieldError message={participantErrors.losses} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="participant-round">Round</Label>
                <input
                  id="participant-round"
                  type="number"
                  min={1}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantRound}
                  onChange={(e) => {
                    setParticipantRound(e.target.value);
                    setParticipantErrors((p) => ({ ...p, roundNumber: '' }));
                  }}
                  aria-invalid={Boolean(participantErrors.roundNumber)}
                />
                <AdminFieldError message={participantErrors.roundNumber} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="participant-buybacks">Buybacks</Label>
                <input
                  id="participant-buybacks"
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantBuybacks}
                  onChange={(e) => {
                    setParticipantBuybacks(e.target.value);
                    setParticipantErrors((p) => ({ ...p, buybackCount: '' }));
                  }}
                  aria-invalid={Boolean(participantErrors.buybackCount)}
                />
                <AdminFieldError message={participantErrors.buybackCount} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveParticipant} disabled={updateParticipant.isPending}>
                {updateParticipant.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditParticipantId(null)}>Cancel</Button>
            </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editRoundId)}
        title="Edit round"
        onClose={() => setEditRoundId(null)}
        busy={updateRound.isPending}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs" htmlFor="round-status">Status</Label>
            <Select
              id="round-status"
              className="mt-1"
              value={roundStatus}
              onChange={(e) => setRoundStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
              Closing a round here only changes its record. Use <strong>Close round</strong> above to
              actually advance players.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateRound.mutate()} disabled={updateRound.isPending}>
              {updateRound.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditRoundId(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
