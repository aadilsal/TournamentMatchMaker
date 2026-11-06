import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, CheckCircle2, X } from 'lucide-react';
import { ApiClientError, apiPost } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import { getPasswordRequirements, passwordRuleError } from '@/lib/password-strength';
import { Button, buttonVariants } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Invalid/expired link and weak password both come back as 400 with the reason in the message.
function resetErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.status === 400 && !/invalid request data/i.test(err.message)) {
    return err.message;
  }
  return getUserErrorMessage(err);
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const reset = useMutation({
    mutationFn: () => apiPost('/auth/reset-password', { token, password }),
    onError: (err) => setError(resetErrorMessage(err)),
  });

  const ruleError = passwordRuleError(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (ruleError) return setError(ruleError);
    if (password !== confirm) return setError('Passwords do not match');
    reset.mutate();
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          {!reset.isSuccess && token && (
            <CardDescription>Pick something you haven&rsquo;t used here before.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!token ? (
            <div role="alert" className="space-y-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                This reset link is incomplete. Open the link from your email again, or request a new one.
              </p>
              <Link to="/forgot-password" className={buttonVariants({ className: 'w-full' })}>
                Request a new link
              </Link>
            </div>
          ) : reset.isSuccess ? (
            <div role="status" className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
                <p className="text-sm">Your password has been changed. Sign in with your new password.</p>
              </div>
              <Link to="/login" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
                Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <PasswordInput
                  id="reset-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  aria-invalid={password.length > 0 && !!ruleError}
                  aria-describedby="reset-requirements"
                  required
                />
                <ul id="reset-requirements" className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-3">
                  {getPasswordRequirements(password).map((req) => (
                    <li
                      key={req.id}
                      className={cn(
                        'flex items-center gap-1.5 text-xs',
                        req.met ? 'text-emerald-400' : 'text-[var(--color-muted-foreground)]'
                      )}
                    >
                      {req.met ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3 opacity-50" aria-hidden />}
                      {req.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">Confirm new password</Label>
                <PasswordInput
                  id="reset-confirm"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (error) setError('');
                  }}
                  aria-invalid={mismatch}
                  required
                />
                {mismatch && <p className="text-xs text-[var(--color-destructive)]">Passwords do not match</p>}
              </div>
              {error && (
                <div
                  role="alert"
                  className="space-y-1 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                >
                  <p>{error}</p>
                  {!ruleError && password === confirm && (
                    <Link to="/forgot-password" className="font-medium underline">
                      Request a new link
                    </Link>
                  )}
                </div>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={reset.isPending}
              >
                {reset.isPending ? 'Saving…' : 'Set new password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
