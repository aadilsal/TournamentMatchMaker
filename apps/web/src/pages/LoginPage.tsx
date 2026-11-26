import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthTokens } from '@vr-tournament/shared';
import { apiPost, setAccessToken } from '@/lib/api';
import { connectSocket } from '@/hooks/useSocket';
import { isAdminRole } from '@/hooks/useAuthUser';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { postLoginPath, sanitizeReturnTo } from '@/lib/return-to';
import { GuestOnly } from '@/components/auth/GuestOnly';
import { AuthShowcase } from '@/components/auth/AuthShowcase';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

export function LoginPage() {
  return (
    <GuestOnly>
      <LoginForm />
    </GuestOnly>
  );
}

function LoginForm() {
  const navigate   = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const login = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiPost<AuthTokens>('/auth/login', data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(LIVE_QUERY_KEYS.me, data.user);
      connectSocket();
      navigate(postLoginPath(returnTo, isAdminRole(data.user.role)), { replace: true });
    },
    onError: (err: Error) => setError(getUserErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    login.mutate({ email: trimmedEmail, password });
  };

  const clearError = () => {
    if (error) setError('');
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex -my-8 -mx-4 sm:-mx-6">

      <AuthShowcase />

      {/* ── Right panel — sign-in form ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-[var(--color-background)]">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="w-full max-w-sm space-y-7"
        >
          {/* Logo — shown only on mobile when left panel is hidden */}
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30">
              <Trophy className="h-4 w-4 text-[var(--color-primary)]" />
            </span>
            <span className="font-bold">VR Cricket League</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
              Access your tournament account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email address</Label>
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                aria-invalid={!!error}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="login-password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="-my-2 py-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                aria-invalid={!!error}
                required
              />
            </div>
            {error && (
              <p
                className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                role="alert"
                aria-live="polite"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-sm text-center text-[var(--color-muted-foreground)]">
            No account?{' '}
            <Link
              to={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register'}
              className="font-medium text-[var(--color-primary)] hover:underline"
            >
              Create one free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
