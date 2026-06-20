import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import {
  registerFormSchema,
  type AuthTokens,
  type RegisterFormInput,
  type RegisterInput,
} from '@vr-tournament/shared';
import { apiPost, setAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getPasswordRequirements,
  passwordStrengthLabel,
  passwordStrengthScore,
} from '@/lib/password-strength';
import { Check, Trophy, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { CountryCityFields } from '@/components/location/CountryCityFields';
import { downloadPlayerQR } from '@/lib/player-qr';

/* ─────────────────────────────────────────────
   Animated cricket delivery banner
   Side-view: ball arcs from bowler (left) → stumps (right)
───────────────────────────────────────────── */
const BANNER_STARS: [number, number, number][] = [
  [30,18,0.6],[80,10,0.5],[130,22,0.7],[190,8,0.5],[240,20,0.6],
  [290,12,0.5],[340,25,0.6],[395,14,0.7],[440,20,0.5],[490,10,0.6],
  [55,40,0.4],[140,35,0.5],[225,42,0.4],[310,38,0.5],[390,42,0.4],
];

function CricketDeliveryBanner() {
  return (
    <div className="relative h-36 overflow-hidden bg-[#040c18]">
      {/* Static SVG: sky, ground, pitch, stumps */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 500 144"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id="bsky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#020810" />
            <stop offset="70%" stopColor="#071228" />
            <stop offset="100%" stopColor="#081a10" />
          </linearGradient>
          <linearGradient id="bground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0b220b" />
            <stop offset="100%" stopColor="#071407" />
          </linearGradient>
          <linearGradient id="bpitch" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#7a6a44" />
            <stop offset="100%" stopColor="#8c7c52" />
          </linearGradient>
          <radialGradient id="bfl1" cx="5%" cy="10%" r="45%">
            <stop offset="0%"   stopColor="rgba(180,210,255,0.22)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="bfl2" cx="95%" cy="10%" r="45%">
            <stop offset="0%"   stopColor="rgba(180,210,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="bsg" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(255,210,70,0.55)" />
            <stop offset="100%" stopColor="rgba(255,170,30,0)" />
          </radialGradient>
        </defs>

        {/* Background */}
        <rect width="500" height="144" fill="url(#bsky)" />
        <rect width="500" height="144" fill="url(#bfl1)" />
        <rect width="500" height="144" fill="url(#bfl2)" />

        {/* Stars */}
        {BANNER_STARS.map(([x, y, o], i) => (
          <circle key={i} cx={x} cy={y} r="0.9" fill="white" opacity={o} />
        ))}

        {/* Ground */}
        <rect x="0" y="110" width="500" height="34" fill="url(#bground)" />

        {/* Pitch strip (lighter surface from center-left to stumps) */}
        <rect x="90" y="104" width="340" height="14" rx="1" fill="url(#bpitch)" opacity="0.88" />

        {/* Crease line at stumps */}
        <line x1="400" y1="104" x2="400" y2="118" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />

        {/* Stump glow (at right end) */}
        <ellipse cx="418" cy="110" rx="28" ry="14" fill="url(#bsg)" />

        {/* 3 stumps */}
        <rect x="406" y="72"  width="4" height="42" rx="0.8" fill="#f0dea8" />
        <rect x="416" y="72"  width="4" height="42" rx="0.8" fill="#f0dea8" />
        <rect x="426" y="72"  width="4" height="42" rx="0.8" fill="#f0dea8" />
        {/* Bails */}
        <rect x="404" y="70"  width="9"  height="2.5" rx="1.2" fill="#f0dea8" />
        <rect x="414" y="70"  width="9"  height="2.5" rx="1.2" fill="#f0dea8" />

        {/* Bowler run-up marker (left) */}
        <circle cx="28" cy="90" r="4" fill="rgba(120,100,60,0.5)" />
        <circle cx="28" cy="90" r="2" fill="rgba(180,160,100,0.5)" />

        {/* Floodlight poles */}
        <rect x="6"   y="0" width="3" height="55" fill="rgba(140,160,200,0.15)" />
        <rect x="490" y="0" width="3" height="55" fill="rgba(140,160,200,0.15)" />
        <rect x="2"   y="0" width="14" height="5" rx="1" fill="rgba(200,220,255,0.22)" />
        <rect x="487" y="0" width="14" height="5" rx="1" fill="rgba(200,220,255,0.22)" />
      </svg>

      {/* ── Animated cricket ball (side-view delivery arc) ── */}
      {/* Arc: starts high-left (bowler hand), dips to pitch, rises to stumps */}
      <motion.div
        aria-hidden
        className="absolute rounded-full pointer-events-none z-10"
        style={{
          width: 13,
          height: 13,
          background: 'radial-gradient(circle at 35% 28%, #ff5050 0%, #cc1111 45%, #6b0000 100%)',
          boxShadow: '0 0 10px 3px rgba(255,50,50,0.7)',
        }}
        animate={{
          left: ['5%',   '30%',  '54%',  '55%',  '82%'],
          top:  ['55%',  '70%',  '80%',  '80%',  '46%'],
          scale: [0.7,    0.9,    1.0,    1.0,    1.0],
          opacity: [0,    1,      1,      1,      0],
        }}
        transition={{
          duration: 1.9,
          repeat: Infinity,
          repeatDelay: 2.2,
          ease: 'easeInOut',
          times: [0, 0.35, 0.55, 0.62, 1],
        }}
      />

      {/* ── Ball motion trail (faint streak) ── */}
      <motion.div
        aria-hidden
        className="absolute rounded-full pointer-events-none z-10"
        style={{
          width: 24,
          height: 5,
          background: 'linear-gradient(to right, rgba(255,50,50,0), rgba(255,50,50,0.35))',
          borderRadius: 99,
        }}
        animate={{
          left: ['3%',   '28%',  '52%',  '80%'],
          top:  ['58%',  '72%',  '81%',  '49%'],
          rotate: [-10,  15,     -25,    -35],
          opacity: [0,    0.6,    0.6,    0],
        }}
        transition={{
          duration: 1.9,
          repeat: Infinity,
          repeatDelay: 2.2,
          ease: 'easeInOut',
          times: [0, 0.35, 0.6, 1],
          delay: 0.04,
        }}
      />

      {/* ── Stump glow pulse ── */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none z-10 rounded-full"
        style={{
          width: 60,
          height: 30,
          right: '14%',
          top: '68%',
          background: 'radial-gradient(ellipse, rgba(255,200,60,0.5) 0%, rgba(255,160,20,0) 100%)',
          filter: 'blur(3px)',
        }}
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Season label */}
      <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-20">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
          VR Cricket League · Season 1 · Canada
        </span>
      </div>
    </div>
  );
}

type FieldErrors = Partial<Record<keyof RegisterFormInput | 'form', string>>;

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

const initialForm = {
  email: '',
  password: '',
  confirmPassword: '',
  username: '',
  country: '',
  city: '',
  hasVrHeadset: false,
  vrDeviceType: 'Meta Quest 3',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
  acceptTerms: false as boolean,
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});

  const passwordReqs = getPasswordRequirements(form.password);
  const strengthScore = passwordStrengthScore(form.password);
  const strengthText = passwordStrengthLabel(strengthScore);

  const register = useMutation({
    mutationFn: (payload: RegisterInput) =>
      apiPost<AuthTokens>('/auth/register', payload),
    onSuccess: async (data, variables) => {
      setAccessToken(data.accessToken);
      try {
        await downloadPlayerQR(data.user.id, data.user.username);
      } catch (err) {
        console.error('Failed to download venue QR code:', err);
      }
      navigate('/welcome', {
        state: {
          hasVrHeadset: variables.hasVrHeadset ?? false,
          city: variables.city,
          latitude: variables.latitude,
          longitude: variables.longitude,
        },
      });
    },
    onError: (err: Error) => setServerError(err.message),
  });

  const { data: nearbyVenues = [] } = useQuery({
    queryKey: ['register-venues', form.latitude, form.longitude, form.city],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '3' });
      if (form.latitude !== undefined && form.longitude !== undefined) {
        params.set('lat', String(form.latitude));
        params.set('lng', String(form.longitude));
      } else if (form.city) {
        params.set('city', form.city);
      }
      return apiGet<Venue[]>(`/venues?${params.toString()}`);
    },
    enabled: !form.hasVrHeadset && (!!form.city || (form.latitude !== undefined && form.longitude !== undefined)),
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setServerError('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update('latitude', pos.coords.latitude);
        update('longitude', pos.coords.longitude);
        setServerError('');
      },
      () => setServerError('Could not detect your location. Enter your city or try again.')
    );
  };

  const validate = (): RegisterFormInput | null => {
    const result = registerFormSchema.safeParse(form);
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !errors[key as keyof RegisterFormInput]) {
          errors[key as keyof RegisterFormInput] = issue.message;
        }
      }
      setFieldErrors(errors);
      return null;
    }
    setFieldErrors({});
    return result.data;
  };

  const handleBlur = (field: string) => {
    setTouched((t) => ({ ...t, [field]: true }));
    validate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setTouched({
      email: true,
      username: true,
      password: true,
      confirmPassword: true,
      acceptTerms: true,
    });

    const valid = validate();
    if (!valid) return;

    const { confirmPassword: _, acceptTerms: __, ...payload } = valid;
    if (!payload.hasVrHeadset) {
      payload.vrDeviceType = undefined;
    }
    if (payload.latitude === undefined) delete payload.latitude;
    if (payload.longitude === undefined) delete payload.longitude;
    register.mutate(payload);
  };

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key as keyof FieldErrors]) {
      setFieldErrors((e) => {
        const next = { ...e };
        delete next[key as keyof FieldErrors];
        return next;
      });
    }
  };

  const showError = (field: keyof FieldErrors) =>
    touched[field] && fieldErrors[field] ? fieldErrors[field] : undefined;

  return (
    <div className="max-w-lg mx-auto">
      <Card className="border-[var(--color-border)] shadow-lg shadow-purple-950/20 overflow-hidden">
        <CricketDeliveryBanner />
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <Trophy className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Step up to the crease</span>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Register to book venues, join tournaments, and enter the matchmaking queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Account */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Account
              </legend>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  aria-invalid={!!showError('email')}
                  aria-describedby={showError('email') ? 'email-error' : undefined}
                  required
                />
                {showError('email') && (
                  <p id="email-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                    {showError('email')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="player_01"
                  value={form.username}
                  onChange={(e) => update('username', e.target.value)}
                  onBlur={() => handleBlur('username')}
                  aria-invalid={!!showError('username')}
                  aria-describedby="username-hint username-error"
                  required
                />
                <p id="username-hint" className="text-xs text-[var(--color-muted-foreground)]">
                  3–50 characters. Letters, numbers, and underscores only.
                </p>
                {showError('username') && (
                  <p id="username-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                    {showError('username')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  aria-invalid={!!showError('password')}
                  aria-describedby="password-requirements password-error"
                  required
                />
                {form.password.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors',
                              i <= strengthScore
                                ? strengthScore <= 1
                                  ? 'bg-red-500'
                                  : strengthScore <= 2
                                    ? 'bg-amber-500'
                                    : strengthScore <= 3
                                      ? 'bg-blue-500'
                                      : 'bg-emerald-500'
                                : 'bg-[var(--color-muted)]'
                            )}
                          />
                        ))}
                      </div>
                      {strengthText && (
                        <span className="text-xs text-[var(--color-muted-foreground)]">{strengthText}</span>
                      )}
                    </div>
                    <ul id="password-requirements" className="grid grid-cols-2 gap-x-2 gap-y-1">
                      {passwordReqs.map((req) => (
                        <li
                          key={req.id}
                          className={cn(
                            'flex items-center gap-1.5 text-xs',
                            req.met ? 'text-emerald-400' : 'text-[var(--color-muted-foreground)]'
                          )}
                        >
                          {req.met ? (
                            <Check className="h-3 w-3 shrink-0" aria-hidden />
                          ) : (
                            <X className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                          )}
                          {req.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {showError('password') && (
                  <p id="password-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                    {showError('password')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  aria-invalid={!!showError('confirmPassword')}
                  aria-describedby={showError('confirmPassword') ? 'confirm-password-error' : undefined}
                  required
                />
                {showError('confirmPassword') && (
                  <p id="confirm-password-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                    {showError('confirmPassword')}
                  </p>
                )}
              </div>
            </fieldset>

            {/* Location */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Location
              </legend>
              <CountryCityFields
                country={form.country}
                city={form.city}
                onLocationDetected={(country, city) => {
                  setForm((f) => ({ ...f, country, city }));
                }}
                onCountryChange={(country) => {
                  setForm((f) => ({ ...f, country, city: '' }));
                }}
                onCityChange={(city) => update('city', city)}
              />
            </fieldset>

            {/* Meta Quest / Oculus */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Meta Quest / Oculus
              </legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]/40">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  checked={form.hasVrHeadset}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      hasVrHeadset: checked,
                      vrDeviceType: checked ? f.vrDeviceType || 'Meta Quest 3' : '',
                    }));
                  }}
                />
                <span>
                  <span className="text-sm font-medium">I have a Meta Quest or Oculus headset</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
                    Play remote PvP without booking a venue. Quest 2, Quest 3, and Oculus devices supported.
                  </span>
                </span>
              </label>

              {form.hasVrHeadset && (
                <div className="space-y-1.5">
                  <Label htmlFor="vrDeviceType">Headset model</Label>
                  <select
                    id="vrDeviceType"
                    value={form.vrDeviceType}
                    onChange={(e) => update('vrDeviceType', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  >
                    {VR_DEVICES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {!form.hasVrHeadset && (
                <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-4">
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    No headset? Share your location so we can suggest the closest VR arenas for venue play.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={requestLocation}>
                    <MapPin className="h-4 w-4" />
                    Use my location
                  </Button>
                  {form.latitude !== undefined && form.longitude !== undefined && (
                    <p className="text-xs text-emerald-400">
                      Location saved — we&apos;ll find venues near you when matching.
                    </p>
                  )}
                  {nearbyVenues.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                        Nearby venues
                      </p>
                      {nearbyVenues.map((venue) => (
                        <li key={venue.id} className="text-sm">
                          {venue.name}
                          <span className="text-[var(--color-muted-foreground)]">
                            {' '}
                            — {venue.city}
                            {venue.distanceM != null && ` (${(venue.distanceM / 1000).toFixed(1)} km)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </fieldset>

            {/* Terms */}
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  checked={form.acceptTerms}
                  onChange={(e) => update('acceptTerms', e.target.checked)}
                  onBlur={() => handleBlur('acceptTerms')}
                  aria-invalid={!!showError('acceptTerms')}
                />
                <span className="text-sm text-[var(--color-muted-foreground)]">
                  I agree to the platform terms and understand my data will be used for matchmaking and bookings.
                </span>
              </label>
              {showError('acceptTerms') && (
                <p className="text-xs text-[var(--color-destructive)]" role="alert">
                  {showError('acceptTerms')}
                </p>
              )}
            </div>

            {serverError && (
              <p className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]" role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={register.isPending}>
              {register.isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-[var(--color-primary)] hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
