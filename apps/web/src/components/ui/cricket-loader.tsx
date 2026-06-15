import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CricketBallLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function CricketBallLoader({ size = 'md', className, label }: CricketBallLoaderProps) {
  const uid = useId().replace(/:/g, '');
  const px = { sm: 28, md: 48, lg: 72 }[size];

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <motion.svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'block' }}
      >
        <defs>
          {/* 3-D leather shading — highlight top-left, deep shadow bottom-right */}
          <radialGradient id={`${uid}lg`} cx="36%" cy="27%" r="72%" fx="36%" fy="27%">
            <stop offset="0%"   stopColor="#ff4c4c" />
            <stop offset="22%"  stopColor="#df1515" />
            <stop offset="52%"  stopColor="#a50000" />
            <stop offset="82%"  stopColor="#660000" />
            <stop offset="100%" stopColor="#3c0000" />
          </radialGradient>

          {/* Fresnel shine overlay — soft rim light from top-left */}
          <radialGradient id={`${uid}sh`} cx="28%" cy="22%" r="34%" fx="26%" fy="20%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.54)" />
            <stop offset="60%"  stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Clip to ball circle */}
          <clipPath id={`${uid}cp`}>
            <circle cx="32" cy="32" r="30" />
          </clipPath>
        </defs>

        {/* ── Ball body ── */}
        <circle cx="32" cy="32" r="30" fill={`url(#${uid}lg)`} />

        {/* Subtle half-shading: one hemisphere slightly darker (leather dye variation) */}
        <path
          d="M 32 2 A 30 30 0 0 1 32 62 Z"
          fill="rgba(0,0,0,0.11)"
          clipPath={`url(#${uid}cp)`}
        />

        {/* ── Seam + stitching (tilted ~22° like a real delivery seam) ── */}
        <g transform="rotate(-22 32 32)">
          {/* Deep seam groove */}
          <ellipse
            cx="32" cy="32" rx="30" ry="13"
            fill="none"
            stroke="rgba(28,0,0,0.92)"
            strokeWidth="5.5"
          />
          {/* Seam ridge highlight (thin, lighter line on top of groove) */}
          <ellipse
            cx="32" cy="32" rx="30" ry="13"
            fill="none"
            stroke="rgba(155,18,18,0.55)"
            strokeWidth="1.4"
          />

          {/* Stitching — inner row (hand-stitched look with rounded dashes) */}
          <ellipse
            cx="32" cy="32" rx="30" ry="9.5"
            fill="none"
            stroke="rgba(255,180,175,0.80)"
            strokeWidth="1.15"
            strokeDasharray="2.6 3.9"
            strokeLinecap="round"
          />
          {/* Stitching — outer row (offset half a dash for alternating pattern) */}
          <ellipse
            cx="32" cy="32" rx="30" ry="16.5"
            fill="none"
            stroke="rgba(255,180,175,0.80)"
            strokeWidth="1.15"
            strokeDasharray="2.6 3.9"
            strokeDashoffset="1.3"
            strokeLinecap="round"
          />
        </g>

        {/* ── Fresnel / diffuse highlight ── */}
        <circle cx="32" cy="32" r="30" fill={`url(#${uid}sh)`} />

        {/* Hard specular (polish glint) */}
        <ellipse
          cx="19" cy="14"
          rx="5.5" ry="3.2"
          fill="rgba(255,255,255,0.48)"
          transform="rotate(-28 19 14)"
        />
        {/* Tiny primary specular dot */}
        <circle cx="16.5" cy="12" r="1.8" fill="rgba(255,255,255,0.62)" />
      </motion.svg>

      {label && (
        <p className="text-sm text-[var(--color-muted-foreground)] animate-pulse">{label}</p>
      )}
    </div>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
      <CricketBallLoader size="lg" label={label} />
    </div>
  );
}
