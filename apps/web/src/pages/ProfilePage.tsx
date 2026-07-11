import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet, apiPatch, getAccessToken } from '@/lib/api';
import { prepareAvatarUpload } from '@/lib/avatar-upload';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryCityFields } from '@/components/location/CountryCityFields';
import { Label } from '@/components/ui/label';
import { ProfileSkeleton } from '@/components/ui/route-fallback';
import { User as UserIcon, MapPin, Headset, BarChart3, CheckCircle2, QrCode, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { MetaLinkCodeDisplay } from '@/components/meta/MetaLinkCodeDisplay';
import { Link } from 'react-router-dom';

import { API_URL } from '@/lib/config';

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

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<User>('/players/me'),
  });

  useEffect(() => {
    if (profile) {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const { data, mimeType } = await prepareAvatarUpload(file);
      return apiPatch<User>('/players/me/avatar', { data, mimeType });
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile', user.username] });
    },
  });

  const avatarUrl = profile?.hasProfilePicture && profile.username
    ? `${API_URL}/api/v1/players/${profile.username}/avatar?v=${encodeURIComponent(profile.updatedAt)}`
    : null;

  if (isLoading) return <ProfileSkeleton />;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
            <UserIcon className="h-4.5 w-4.5 text-[var(--color-primary)]" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Player Profile</h1>
        </div>
        <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
          Manage your tournament settings and preferences
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06 }}
        onSubmit={(e) => { e.preventDefault(); update.mutate(); }}
        className="space-y-5"
      >
        {/* Identity */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <UserIcon className="h-3.5 w-3.5" />
            Identity
          </div>
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover border-2 border-[var(--color-primary)]/30"
              />
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploadAvatar.isPending}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploadAvatar.isPending
                    ? 'Uploading…'
                    : profile?.hasProfilePicture
                      ? 'Change photo'
                      : 'Choose photo'}
                </Button>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  JPG, PNG, or WebP
                </span>
              </div>
              {uploadAvatar.isError && (
                <p className="text-xs text-[var(--color-destructive)]">
                  {getUserErrorMessage(uploadAvatar.error)}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="player_01"
            />
          </div>
          <Link to={`/players/${form.username}`} className="text-sm text-[var(--color-primary)] hover:underline">
            View public profile
          </Link>
        </section>

        {/* Location */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <MapPin className="h-3.5 w-3.5" />
            Location
          </div>
          <CountryCityFields
            country={form.country}
            city={form.city}
            autoDetectFromIp={!isLoading && !profile?.country && !profile?.city}
            onLocationDetected={(country, city) => {
              setForm((f) => ({ ...f, country, city }));
            }}
            onCountryChange={(country) => setForm((f) => ({ ...f, country, city: '' }))}
            onCityChange={(city) => setForm((f) => ({ ...f, city }))}
          />
        </section>

        {/* VR Setup */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <Headset className="h-3.5 w-3.5" />
            VR Setup
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-muted)]/30 transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              checked={form.hasVrHeadset}
              onChange={(e) => setForm({ ...form, hasVrHeadset: e.target.checked })}
            />
            <span>
              <span className="text-sm font-medium">I have a VR headset</span>
              <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
                Play remote PvP without booking a venue.
              </span>
            </span>
          </label>
          {form.hasVrHeadset && (
            <div className="space-y-1.5">
              <Label htmlFor="vrDeviceType">Headset model</Label>
              <select
                id="vrDeviceType"
                value={form.vrDeviceType}
                onChange={(e) => setForm({ ...form, vrDeviceType: e.target.value })}
                className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                {VR_DEVICES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Rating — assigned by the game */}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <BarChart3 className="h-3.5 w-3.5" />
            Rating
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-muted-foreground)]">Skill tier</p>
              <p className="text-2xl font-bold mt-1">Tier {profile?.skillTier ?? '—'}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Assigned by match results</p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-muted-foreground)]">Rating points</p>
              <p className="text-2xl font-bold mt-1">{profile?.ratingPoints ?? '—'}</p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">+30 win · −18 loss</p>
            </div>
          </div>
        </section>

        {/* Feedback */}
        {update.isSuccess && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
            <CheckCircle2 className="h-4 w-4" /> Profile saved
          </p>
        )}
        {update.isError && (
          <p className="text-sm text-[var(--color-destructive)]">{getUserErrorMessage(update.error)}</p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </motion.form>

      {profile && (
        <section className="space-y-3 mt-4">
          <MetaLinkCodeDisplay />
        </section>
      )}
    </div>
  );
}
