import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
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
import { Check, Gamepad2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type FieldErrors = Partial<Record<keyof RegisterFormInput | 'form', string>>;

const VR_DEVICES = ['Meta Quest 2', 'Meta Quest 3', 'Meta Quest 3S', 'PlayStation VR2', 'Valve Index', 'Other'];

const initialForm = {
  email: '',
  password: '',
  confirmPassword: '',
  username: '',
  country: 'Pakistan',
  city: 'Lahore',
  hasVrHeadset: false,
  vrDeviceType: '',
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
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate('/profile');
    },
    onError: (err: Error) => setServerError(err.message),
  });

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
      <Card className="border-[var(--color-border)] shadow-lg shadow-purple-950/20">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <Gamepad2 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Join the arena</span>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    autoComplete="country-name"
                    value={form.country}
                    onChange={(e) => update('country', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(e) => update('city', e.target.value)}
                  />
                </div>
              </div>
            </fieldset>

            {/* VR setup */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                VR setup
              </legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border)] p-3 transition-colors hover:bg-[var(--color-muted)]/40">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  checked={form.hasVrHeadset}
                  onChange={(e) => update('hasVrHeadset', e.target.checked)}
                />
                <span>
                  <span className="text-sm font-medium">I have a VR headset</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
                    Enables remote matches without booking a venue.
                  </span>
                </span>
              </label>

              {form.hasVrHeadset && (
                <div className="space-y-1.5">
                  <Label htmlFor="vrDeviceType">VR device (optional)</Label>
                  <select
                    id="vrDeviceType"
                    value={form.vrDeviceType}
                    onChange={(e) => update('vrDeviceType', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  >
                    <option value="">Select device</option>
                    {VR_DEVICES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
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
