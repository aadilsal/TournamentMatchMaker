import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet, apiPatch, getAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    username: '',
    country: '',
    city: '',
    hasVrHeadset: false,
    vrDeviceType: '',
    skillTier: 3,
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
        skillTier: profile.skillTier,
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

  if (isLoading) return <p>Loading profile...</p>;

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Player Profile</CardTitle>
          <CardDescription>Manage your VR tournament settings</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-sm font-medium">Username</label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Country</label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">City</label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasVrHeadset}
                onChange={(e) => setForm({ ...form, hasVrHeadset: e.target.checked })}
              />
              I have a VR headset
            </label>
            {form.hasVrHeadset && (
              <div>
                <label className="text-sm font-medium">VR Device Type</label>
                <Input
                  placeholder="e.g. Meta Quest 3"
                  value={form.vrDeviceType}
                  onChange={(e) => setForm({ ...form, vrDeviceType: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Skill Tier (1-5)</label>
              <Select
                value={form.skillTier}
                onChange={(e) => setForm({ ...form, skillTier: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((t) => (
                  <option key={t} value={t}>Tier {t}</option>
                ))}
              </Select>
            </div>
            {update.isSuccess && (
              <p className="text-sm text-green-400">Profile updated successfully</p>
            )}
            {update.isError && (
              <p className="text-sm text-[var(--color-destructive)]">{(update.error as Error).message}</p>
            )}
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
