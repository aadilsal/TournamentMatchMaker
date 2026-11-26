import { Trophy } from 'lucide-react';

/** The image panel beside the login and register forms (wide screens only); pinned while the form scrolls. */
export function AuthShowcase() {
  return (
    <div className="hidden lg:flex lg:w-1/2 lg:sticky lg:top-16 lg:self-start lg:h-[calc(100dvh-4rem)] relative overflow-hidden flex-col bg-[#0a0a0a]">

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
          background: 'radial-gradient(ellipse, rgba(227,24,55,0.22) 0%, transparent 70%)',
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

      {/* Red brand tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'rgba(227,24,55,0.08)' }}
      />

      {/* Right-edge blend */}
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0a0a0a]/40 to-transparent pointer-events-none" />

      {/* Bottom fill — dark behind the text */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: '52%',
          background: 'linear-gradient(to top, #0a0a0a 45%, rgba(10,10,10,0.85) 65%, transparent 100%)',
        }}
      />

      {/* Bottom branding — chips sit above the heading with equal spacing on both sides */}
      <div aria-hidden className="h-[46%] shrink-0" />
      <div className="relative z-10 flex-1 px-10 pb-10 pt-8 flex flex-col justify-center gap-8">

        {/* Chips row — equal gap above (pt-8) and below (gap-8) matches heading spacing */}
        <div className="flex items-center gap-3">
          {([
            { label: '🏏 Super Over', borderColor: 'rgba(227,24,55,0.45)', color: '#fecaca', bg: 'rgba(227,24,55,0.26)' },
            { label: '🥽 Meta Quest',borderColor: 'rgba(255,255,255,0.25)', color: '#ffffff', bg: 'rgba(255,255,255,0.08)' },
            { label: '1–20 overs',  borderColor: 'rgba(227,24,55,0.35)',  color: '#fca5a5', bg: 'rgba(227,24,55,0.13)' },
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
            <Trophy className="h-5 w-5 text-[var(--color-primary)]" />
            <span className="text-white/85 font-semibold tracking-tight">VR Cricket League</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug">
            The first<br />VR cricket league
          </h2>
          <p className="mt-2 text-white/50 text-sm leading-relaxed">
            Super Over to T20 · Knockout draw · Arena or home
          </p>
        </div>

      </div>
    </div>
  );
}
