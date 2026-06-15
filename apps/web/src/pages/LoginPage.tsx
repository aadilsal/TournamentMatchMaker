import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { AuthTokens } from '@vr-tournament/shared';
import { apiPost, setAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

export function LoginPage() {
  const navigate   = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const login = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiPost<AuthTokens>('/auth/login', data),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate('/venues');
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex -my-8 -mx-4 sm:-mx-6">

      {/* ── Left panel — cartoonplayer2.png ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col bg-[#080614]">

        {/* Subtle dot grid — visible in the dark top area */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Ambient orb — top-centre glow behind the chips */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, rgba(124,58,237,0.22) 0%, transparent 70%)',
            filter: 'blur(24px)',
          }}
        />

        {/* Hero image — mask fades it out just above the jersey logo (~44 % down),
            so the logo area is fully transparent and the dark panel shows through */}
        <img
          src="/images/cartoonplayer2.png"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{
            filter: 'brightness(0.86) saturate(1.1)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 53%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 53%)',
          }}
        />

        {/* Purple brand tint */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'rgba(60,20,120,0.15)' }}
        />

        {/* Right-edge blend */}
        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#080614]/40 to-transparent pointer-events-none" />

        {/* Bottom fill — dark behind the text */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '52%',
            background: 'linear-gradient(to top, #080614 45%, rgba(8,6,20,0.85) 65%, transparent 100%)',
          }}
        />

        {/* Bottom branding — chips sit above the heading with equal spacing on both sides */}
        <div className="relative z-10 mt-auto px-10 pb-10 pt-8 flex flex-col gap-8">

          {/* Chips row — equal gap above (pt-8) and below (gap-8) matches heading spacing */}
          <div className="flex items-center gap-3">
            {([
              { label: '🏏 Super Over', borderColor: 'rgba(167,139,250,0.45)', color: '#ddd6fe', bg: 'rgba(124,58,237,0.26)' },
              { label: '📍 Canada',     borderColor: 'rgba(251,191,36,0.35)',  color: '#fcd34d', bg: 'rgba(251,191,36,0.1)'  },
              { label: '6 balls only',  borderColor: 'rgba(52,211,153,0.35)',  color: '#6ee7b7', bg: 'rgba(52,211,153,0.13)' },
            ] as const).map((chip) => (
              <div
                key={chip.label}
                className="rounded-xl backdrop-blur-sm px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                style={{
                  border: `1px solid ${chip.borderColor}`,
                  color: chip.color,
                  background: chip.bg,
                }}
              >
                {chip.label}
              </div>
            ))}
          </div>

          {/* Heading */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-amber-400" />
              <span className="text-white/85 font-semibold tracking-tight">VR Cricket League</span>
            </div>
            <h2 className="text-3xl font-bold text-white leading-snug">
              Canada's first<br />VR cricket tournament
            </h2>
            <p className="mt-2 text-white/50 text-sm leading-relaxed">
              6-ball Super Over format · Skill-tier matchmaking · Certified arenas
            </p>
          </div>

        </div>
      </div>

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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email address</Label>
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p
                className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                role="alert"
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
            <Link to="/register" className="font-medium text-[var(--color-primary)] hover:underline">
              Create one free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
