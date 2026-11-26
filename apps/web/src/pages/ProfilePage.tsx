import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet, apiPatch, getAccessToken } from '@/lib/api';
import { prepareAvatarUpload } from '@/lib/avatar-upload';
import { getUserErrorMessage } from '@/lib/user-messages';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryCityFields } from '@/components/location/CountryCityFields';
import { Label } from '@/components/ui/label';
import { ProfileSkeleton } from '@/components/ui/route-fallback';
import { QueryError } from '@/components/ui/query-error';
import { User as UserIcon, MapPin, Headset, BarChart3, CheckCircle2, Upload, CalendarDays } from 'lucide-react';
import { motion } from 'motion/react';
import { MetaLinkCodeDisplay } from '@/components/meta/MetaLinkCodeDisplay';
import { Tabs } from '@/components/ui/tabs';
import { PlayerStatsView } from '@/components/profile/PlayerStatsView';
import { Link } from 'react-router-dom';

import { API_URL } from '@/lib/config';
import { formatDate } from '@/lib/format';

const VR_DEVICES = [
  'Meta Quest 3',
  'Meta Quest 3S',
  'Meta Quest 2',
  'Meta Quest Pro',
  'Oculus Rift S',
  'PlayStation VR2',
  'Valve Index',
  'Other',
];

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'stats' | 'edit'>('stats');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    username: '',
    country: '',
    city: '',
    hasVrHeadset: false,
    vrDeviceType: '',
  });

  useEffect(() => {
    if (!getAccessToken()) navigate('/login');
  }, [navigate]);

  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: LIVE_QUERY_KEYS.me,
    queryFn: () => apiGet<User>('/players/me'),
  });

  // Fill the form once per account so a background refetch never overwrites unsaved edits.
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (profile && loadedId.current !== profile.id) {
      loadedId.current = profile.id;
      setForm({
        username: profile.username,
        country: profile.country || '',
        city: profile.city || '',
        hasVrHeadset: profile.hasVrHeadset,
        vrDeviceType: profile.vrDeviceType || '',
      });
    }
  }, [profile]);

  const update = useMutation({
    mutationFn: () =>
      apiPatch<User>('/players/me', {
        ...form,
        vrDeviceType: form.vrDeviceType || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.me }),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const { data, mimeType } = await prepareAvatarUpload(file);
      return apiPatch<User>('/players/me/avatar', { data, mimeType });
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.me });
      queryClient.invalidateQueries({ queryKey: ['public-profile', user.username] });
    },
  });

  const avatarUrl = profile?.hasProfilePicture && profile.username
    ? `${API_URL}/api/v1/players/${profile.username}/avatar?v=${encodeURIComponent(profile.updatedAt)}`
    : null;

  if (isLoading) return <ProfileSkeleton />;
  if (!profile) {
    return <QueryError error={error} resource="profile" onRetry={() => refetch()} className="max-w-lg mx-auto" />;
  }

  const section = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4';
  const sectionTitle = 'flex items-center gap-2 font-semibold';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Player header, same as the public profile */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-5 sm:flex-row sm:items-center"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover border-2 border-[var(--color-primary)]/30" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-3xl font-bold text-[var(--color-primary)]">
            {profile.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="truncate text-3xl font-bold">{profile.username}</h1>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--color-muted-foreground)]">
            {profile.city && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
            )}
            <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Tier {profile.skillTier}</span>
            {profile.hasVrHeadset && (
              <span className="flex items-center gap-1"><Headset className="h-3.5 w-3.5" />{profile.vrDeviceType ?? 'VR'}</span>
            )}
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Playing since {formatDate(profile.createdAt)}</span>
          </div>
        </div>
        <Link to={`/players/${profile.username}`} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start sm:self-center' })}>
          View public profile
        </Link>
      </motion.div>

      <Tabs
        tabs={[{ id: 'stats', label: 'My stats' }, { id: 'edit', label: 'Edit profile' }]}
        active={tab}
        onChange={(t) => setTab(t as 'stats' | 'edit')}
      />

      {tab === 'stats' && <PlayerStatsView username={profile.username} showTier />}

      {tab === 'edit' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }} className="space-y-5 lg:col-span-2">
            <section className={section}>
              <h2 className={sectionTitle}><UserIcon className="h-4 w-4 text-[var(--color-primary)]" />Identity</h2>
              <div className="flex flex-wrap items-center gap-4">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover border-2 border-[var(--color-primary)]/30" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xl font-bold text-[var(--color-primary)]">
                    {form.username.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="avatar">Profile photo</Label>
                  <input
                    ref={avatarInputRef}
                    id="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadAvatar.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAvatar.mutate(file);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploadAvatar.isPending} onClick={() => avatarInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                      {uploadAvatar.isPending ? 'Uploading…' : profile.hasProfilePicture ? 'Change photo' : 'Choose photo'}
                    </Button>
                    <span className="text-xs text-[var(--color-muted-foreground)]">JPG, PNG, or WebP</span>
                  </div>
                  {uploadAvatar.isError && <p className="text-xs text-[var(--color-destructive)]">{getUserErrorMessage(uploadAvatar.error)}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="player_01" />
                <p className="text-xs text-[var(--color-muted-foreground)]">Shown on leaderboards, tournament pages and your public profile.</p>
              </div>
            </section>

            <section className={section}>
              <h2 className={sectionTitle}><MapPin className="h-4 w-4 text-[var(--color-primary)]" />Location</h2>
              <CountryCityFields
                country={form.country}
                city={form.city}
                autoDetectFromIp={!isLoading && !profile.country && !profile.city}
                onLocationDetected={(country, city) => setForm((f) => ({ ...f, country, city }))}
                onCountryChange={(country) => setForm((f) => ({ ...f, country, city: '' }))}
                onCityChange={(city) => setForm((f) => ({ ...f, city }))}
              />
            </section>

            <section className={section}>
              <h2 className={sectionTitle}><Headset className="h-4 w-4 text-[var(--color-primary)]" />VR setup</h2>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-muted)]/30 transition-colors">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  checked={form.hasVrHeadset}
                  onChange={(e) => setForm({ ...form, hasVrHeadset: e.target.checked })}
                />
                <span>
                  <span className="text-sm font-medium">I have a VR headset</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">Play from home on your own headset, as well as at venues.</span>
                </span>
              </label>
              {form.hasVrHeadset && (
                <div className="space-y-1.5">
                  <Label htmlFor="vrDeviceType">Headset model</Label>
                  <select
                    id="vrDeviceType"
                    value={form.vrDeviceType}
                    onChange={(e) => setForm({ ...form, vrDeviceType: e.target.value })}
                    className="flex h-11 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  >
                    {VR_DEVICES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {update.isSuccess && (
                <p className="mr-auto flex items-center gap-2 text-sm text-[var(--color-primary)]"><CheckCircle2 className="h-4 w-4" /> Profile saved</p>
              )}
              {update.isError && <p className="mr-auto text-sm text-[var(--color-destructive)]">{getUserErrorMessage(update.error)}</p>}
              <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </form>

          <aside className="space-y-3">
            <MetaLinkCodeDisplay />
            <p className="px-1 text-xs text-[var(--color-muted-foreground)]">
              Type this code into the Quest app once so your scores land on your account.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
