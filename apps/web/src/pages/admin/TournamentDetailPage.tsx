import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Match,
  Tournament,
  TournamentBracket,
  TournamentParticipant,
  TournamentRegistration,
  TournamentRound,
} from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, PagedDataTable, StatusPill } from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GridSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { KnockoutBracket } from '@/components/tournament/KnockoutBracket';

export function AdminTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('participants');
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

  const { data: tournament, isLoading } = useQuery({
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'tournament', id] });
  };

  const publish = useMutation({ mutationFn: () => apiPost(`/admin/tournaments/${id}/publish`), onSuccess: invalidate });
  const closeReg = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/close-registration`),
    onSuccess: invalidate,
  });
  const start = useMutation({ mutationFn: () => apiPost(`/admin/tournaments/${id}/start`), onSuccess: invalidate });
  const complete = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/complete`),
    onSuccess: invalidate,
  });
  const closeRound = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/close-round`, {}),
    onSuccess: invalidate,
  });
  const syncStats = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/participants/sync-stats`),
    onSuccess: invalidate,
  });

  const addRegistration = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/registrations`, { userId: registerUserId }),
    onSuccess: () => {
      setRegisterUserId('');
      invalidate();
    },
  });

  const removeRegistration = useMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/tournaments/${id}/registrations/${userId}`),
    onSuccess: invalidate,
  });

  const updateParticipant = useMutation({
    mutationFn: () =>
      apiPatch(`/admin/participants/${editParticipantId}`, {
        status: participantStatus,
        wins: parseInt(participantWins, 10),
        losses: parseInt(participantLosses, 10),
        roundNumber: parseInt(participantRound, 10),
        buybackCount: parseInt(participantBuybacks, 10),
      }),
    onSuccess: () => {
      setEditParticipantId(null);
      invalidate();
    },
  });

  const assignAdmin = useMutation({
    mutationFn: () => apiPost(`/admin/tournaments/${id}/admins`, { userId: assignAdminUserId }),
    onSuccess: () => {
      setAssignAdminUserId('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'tournament', id, 'admins'] });
    },
  });

  const removeAdmin = useMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/tournaments/${id}/admins/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tournament', id, 'admins'] }),
  });

  const createRound = useMutation({
    mutationFn: () =>
      apiPost(`/admin/tournaments/${id}/rounds`, {
        roundNumber: parseInt(newRoundNumber, 10),
        startsAt: new Date(newRoundStart).toISOString(),
        endsAt: new Date(newRoundEnd).toISOString(),
        status: 'active',
      }),
    onSuccess: () => {
      setNewRoundStart('');
      setNewRoundEnd('');
      invalidate();
    },
  });

  const updateRound = useMutation({
    mutationFn: () => apiPatch(`/admin/rounds/${editRoundId}`, { status: roundStatus }),
    onSuccess: () => {
      setEditRoundId(null);
      invalidate();
    },
  });

  if (isLoading) return <GridSkeleton count={4} />;
  if (!tournament) return <p>Tournament not found</p>;

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

      <AdminCard className="p-4 mb-6 flex flex-wrap gap-2 items-center">
        <StatusPill status={tournament.status} />
        <StatusPill status={tournament.phase} />
        <span className="text-sm text-[var(--color-muted-foreground)]">
          {tournament.registrationCount ?? 0} registered
        </span>
        <div className="flex flex-wrap gap-2 ml-auto">
          {tournament.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => publish.mutate()}>Publish</Button>
          )}
          {tournament.status === 'open' && (
            <Button size="sm" variant="outline" onClick={() => closeReg.mutate()}>Close registration</Button>
          )}
          {tournament.status === 'closed' && (
            <Button size="sm" variant="outline" onClick={() => start.mutate()}>Start</Button>
          )}
          {tournament.status === 'in_progress' && (
            <>
              <Button size="sm" variant="outline" onClick={() => closeRound.mutate()}>Close round</Button>
              <Button size="sm" variant="outline" onClick={() => complete.mutate()}>Complete</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => syncStats.mutate()}>Sync stats</Button>
        </div>
      </AdminCard>

      <AdminPageHeader title="Tournament admins" description="Users who can manage this tournament" />
      <AdminCard className="p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <UserPicker value={assignAdminUserId} onChange={setAssignAdminUserId} label="Assign admin" />
          </div>
          <Button size="sm" onClick={() => assignAdmin.mutate()} disabled={!assignAdminUserId}>
            Assign
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
                  className="text-destructive"
                  onClick={() => removeAdmin.mutate(a.userId)}
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
            status: <StatusPill status={p.status} />,
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
              Register
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
                  className="text-destructive"
                  onClick={() => removeRegistration.mutate(r.userId)}
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
            status: <StatusPill status={m.status} />,
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
              <Label className="text-xs">Round #</Label>
              <input
                type="number"
                min={1}
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundNumber}
                onChange={(e) => setNewRoundNumber(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Starts</Label>
              <input
                type="datetime-local"
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundStart}
                onChange={(e) => setNewRoundStart(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Ends</Label>
              <input
                type="datetime-local"
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={newRoundEnd}
                onChange={(e) => setNewRoundEnd(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                onClick={() => createRound.mutate()}
                disabled={!newRoundStart || !newRoundEnd || createRound.isPending}
              >
                Add round
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
              status: <StatusPill status={r.status} />,
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
            status: <StatusPill status={b.status} />,
            round: b.roundNumber,
          }))}
          emptyMessage="No buybacks"
        />
      )}

      {editParticipantId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <AdminCard className="p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold">Edit participant</h3>
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={participantStatus}
                onChange={(e) => setParticipantStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="eliminated">Eliminated</option>
                <option value="advanced">Advanced</option>
                <option value="knockout">Knockout</option>
                <option value="out">Out</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Wins</Label>
                <input
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantWins}
                  onChange={(e) => setParticipantWins(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Losses</Label>
                <input
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantLosses}
                  onChange={(e) => setParticipantLosses(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Round</Label>
                <input
                  type="number"
                  min={1}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantRound}
                  onChange={(e) => setParticipantRound(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Buybacks</Label>
                <input
                  type="number"
                  min={0}
                  className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                  value={participantBuybacks}
                  onChange={(e) => setParticipantBuybacks(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => updateParticipant.mutate()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditParticipantId(null)}>Cancel</Button>
            </div>
          </AdminCard>
        </div>
      )}

      {editRoundId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <AdminCard className="p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold">Edit round</h3>
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={roundStatus}
                onChange={(e) => setRoundStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => updateRound.mutate()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditRoundId(null)}>Cancel</Button>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
