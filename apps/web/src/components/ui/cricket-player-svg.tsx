import { useId } from 'react';
import { motion } from 'motion/react';

/**
 * Fully code-drawn chibi cricket batsman.
 * Floats, blinks, and gently rocks the bat — no image files.
 */
export function CricketPlayerSVG({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');

  return (
    <motion.svg
      className={className}
      viewBox="0 0 160 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        {/* Helmet — shiny purple */}
        <radialGradient id={`${uid}h`} cx="36%" cy="26%" r="72%">
          <stop offset="0%"   stopColor="#c084fc" />
          <stop offset="50%"  stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4c1d95" />
        </radialGradient>

        {/* Skin — warm peach */}
        <radialGradient id={`${uid}sk`} cx="42%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#fde8c8" />
          <stop offset="100%" stopColor="#e8976a" />
        </radialGradient>

        {/* Cricket whites */}
        <linearGradient id={`${uid}w`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f4f1ea" />
          <stop offset="100%" stopColor="#d8d5ce" />
        </linearGradient>

        {/* Bat — willow wood */}
        <linearGradient id={`${uid}bt`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#8a5c28" />
          <stop offset="45%"  stopColor="#c89444" />
          <stop offset="100%" stopColor="#7a4c1c" />
        </linearGradient>

        {/* Pads — off-white */}
        <linearGradient id={`${uid}pd`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#dedad0" />
          <stop offset="50%"  stopColor="#f4f2ec" />
          <stop offset="100%" stopColor="#d0cdc4" />
        </linearGradient>
      </defs>

      {/* ═══════════════ BAT (behind body, gentle idle swing) ═══════════════ */}
      <motion.g
        animate={{ rotate: [3, 10, 3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 8%' }}
      >
        {/* Handle */}
        <rect x="119" y="100" width="10" height="35" rx="5" fill="#3e1e06" />
        {/* Grip tape bands */}
        <rect x="119" y="104" width="10" height="3.5" rx="1.5" fill="rgba(0,0,0,0.26)" />
        <rect x="119" y="111" width="10" height="3.5" rx="1.5" fill="rgba(0,0,0,0.26)" />
        <rect x="119" y="118" width="10" height="3.5" rx="1.5" fill="rgba(0,0,0,0.26)" />
        <rect x="119" y="125" width="10" height="3.5" rx="1.5" fill="rgba(0,0,0,0.26)" />
        {/* Blade */}
        <rect x="112" y="133" width="26" height="55" rx="7" fill={`url(#${uid}bt)`} />
        {/* Blade spine ridge */}
        <rect x="124" y="136" width="5" height="48" rx="2.5" fill="rgba(220,165,80,0.55)" />
        {/* Blade toe */}
        <path d="M 112 183 Q 125 195 138 183 L 138 188 Q 125 200 112 188 Z" fill="#7a4c1c" />
        {/* Blade edge shine */}
        <rect x="112" y="133" width="3" height="55" rx="1.5" fill="rgba(255,200,120,0.22)" />
      </motion.g>

      {/* ═══════════════ BODY / TORSO ═══════════════ */}
      <rect
        x="48" y="110" width="66" height="56" rx="20"
        fill={`url(#${uid}w)`}
        style={{ filter: 'drop-shadow(0 3px 8px rgba(124,58,237,0.18))' }}
      />
      {/* V-neck collar */}
      <path d="M 68 110 L 81 122 L 94 110"
        fill="none" stroke="#7c3aed" strokeWidth="3.5" strokeLinejoin="round" />
      {/* Purple accent band */}
      <rect x="48" y="118" width="66" height="4.5" rx="2" fill="#7c3aed" opacity="0.18" />
      {/* Chest badge */}
      <circle cx="81" cy="138" r="7.5" fill="#7c3aed" opacity="0.15" />
      <circle cx="81" cy="138" r="5"   fill="#7c3aed" opacity="0.3" />

      {/* ═══════════════ ARMS ═══════════════ */}
      {/* Right arm → bat handle */}
      <path d="M 112 122 Q 126 112 126 100"
        stroke={`url(#${uid}sk)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      {/* Right hand */}
      <circle cx="126" cy="98" r="8.5" fill={`url(#${uid}sk)`} />

      {/* Left arm — relaxed hang */}
      <path d="M 52 122 Q 40 136 38 152"
        stroke={`url(#${uid}w)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      {/* Left glove — purple */}
      <circle cx="37" cy="154" r="9"   fill="#7c3aed" />
      <circle cx="37" cy="154" r="6.5" fill="#9333ea" />
      <ellipse cx="34" cy="150" rx="3" ry="2" fill="rgba(255,255,255,0.25)" />

      {/* ═══════════════ LEGS ═══════════════ */}
      <rect x="53" y="162" width="24" height="50" rx="11" fill={`url(#${uid}w)`} />
      <rect x="83" y="162" width="24" height="50" rx="11" fill={`url(#${uid}w)`} />
      {/* Batting pads */}
      <rect x="49" y="164" width="32" height="46" rx="9" fill={`url(#${uid}pd)`} />
      <rect x="81" y="164" width="32" height="46" rx="9" fill={`url(#${uid}pd)`} />
      {/* Pad strap lines */}
      <line x1="50" y1="178" x2="80"  y2="178" stroke="#bbb8b0" strokeWidth="1.5" />
      <line x1="50" y1="194" x2="80"  y2="194" stroke="#bbb8b0" strokeWidth="1.5" />
      <line x1="82" y1="178" x2="112" y2="178" stroke="#bbb8b0" strokeWidth="1.5" />
      <line x1="82" y1="194" x2="112" y2="194" stroke="#bbb8b0" strokeWidth="1.5" />

      {/* ═══════════════ SHOES ═══════════════ */}
      <ellipse cx="67"  cy="213" rx="19" ry="8"  fill="#18163a" />
      <ellipse cx="95"  cy="213" rx="19" ry="8"  fill="#18163a" />
      {/* Shoe toe shine */}
      <ellipse cx="61"  cy="209" rx="7"  ry="3"  fill="rgba(255,255,255,0.12)" transform="rotate(-15 61 209)" />
      <ellipse cx="89"  cy="209" rx="7"  ry="3"  fill="rgba(255,255,255,0.12)" transform="rotate(-15 89 209)" />

      {/* ═══════════════ HELMET (drawn over body) ═══════════════ */}
      <ellipse
        cx="81" cy="60" rx="43" ry="40"
        fill={`url(#${uid}h)`}
        style={{ filter: 'drop-shadow(0 5px 16px rgba(124,58,237,0.48))' }}
      />
      {/* Helmet brim */}
      <rect x="38" y="73" width="86" height="11" rx="2" fill="#5b21b6" />
      {/* Visor */}
      <path d="M 50 83 Q 81 99 112 83 L 110 87 Q 81 106 52 87 Z" fill="#4c1d95" />
      {/* Logo badge */}
      <circle cx="81" cy="52" r="8" fill="#4c1d95" />
      <circle cx="81" cy="52" r="6" fill="#6d28d9" />
      <text
        x="81" y="55.5"
        textAnchor="middle"
        fontSize="5" fontWeight="bold"
        fontFamily="system-ui,sans-serif"
        fill="#fbbf24"
      >VR</text>
      {/* Helmet shine */}
      <ellipse cx="60" cy="43" rx="12" ry="7" fill="rgba(255,255,255,0.24)" transform="rotate(-22 60 43)" />
      {/* Vent lines */}
      <line x1="96"  y1="32" x2="99"  y2="50" stroke="rgba(0,0,0,0.12)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="105" y1="38" x2="107" y2="55" stroke="rgba(0,0,0,0.12)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Chin strap */}
      <path d="M 38 79 Q 40 97 62 102"  fill="none" stroke="#5b21b6" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 124 79 Q 122 97 100 102" fill="none" stroke="#5b21b6" strokeWidth="2.5" strokeLinecap="round" />

      {/* ═══════════════ FACE ═══════════════ */}
      <ellipse cx="81" cy="82" rx="31" ry="25" fill={`url(#${uid}sk)`} />
      {/* Blush cheeks */}
      <ellipse cx="64"  cy="89" rx="9.5" ry="6" fill="rgba(240,110,80,0.2)" />
      <ellipse cx="98"  cy="89" rx="9.5" ry="6" fill="rgba(240,110,80,0.2)" />

      {/* Eyes — blink every ~4 s */}
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
        animate={{ scaleY: [1, 0.06, 1] }}
        transition={{ duration: 0.22, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
      >
        <ellipse cx="70" cy="81" rx="6.5" ry="7"   fill="#18082e" />
        <ellipse cx="92" cy="81" rx="6.5" ry="7"   fill="#18082e" />
        {/* Iris highlight */}
        <circle  cx="72.5" cy="78"  r="2.2" fill="white" />
        <circle  cx="94.5" cy="78"  r="2.2" fill="white" />
        {/* Specular dot */}
        <circle  cx="73.5" cy="77"  r="1"   fill="rgba(255,255,255,0.75)" />
        <circle  cx="95.5" cy="77"  r="1"   fill="rgba(255,255,255,0.75)" />
      </motion.g>

      {/* Smile */}
      <path d="M 68 92 Q 81 103 94 92"
        fill="none" stroke="#c05535" strokeWidth="2.3" strokeLinecap="round" />
    </motion.svg>
  );
}
