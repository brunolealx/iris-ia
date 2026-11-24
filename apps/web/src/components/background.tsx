// Fundo animado do site: degradê verde e preto com linhas de dados que
// percorrem uma malha discreta. Movimento lento; desligado em prefers-reduced-motion.
export function TechBackground() {
  // Curvas suaves que atravessam a tela, como trilhas de um circuito orgânico.
  const paths = [
    'M-50 520 C 220 430, 380 610, 640 500 S 1060 330, 1490 430',
    'M-50 640 C 260 560, 460 720, 760 620 S 1180 480, 1490 560',
    'M-50 300 C 200 360, 420 220, 700 300 S 1120 420, 1490 320',
    'M-50 760 C 300 700, 560 820, 860 740 S 1250 660, 1490 720',
    'M-50 180 C 280 240, 520 120, 820 200 S 1210 280, 1490 190',
  ];
  return (
    <div className="bg-tech" aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="glowA" cx="18%" cy="8%" r="60%">
            <stop offset="0" stopColor="#16a34a" stopOpacity="0.7" />
            <stop offset="0.45" stopColor="#065f2c" stopOpacity="0.35" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="glowB" cx="88%" cy="78%" r="55%">
            <stop offset="0" stopColor="#0d9488" stopOpacity="0.45" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#ffffff" fillOpacity="0.07" />
          </pattern>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="fadeMask"><rect width="1440" height="900" fill="url(#fade)" /></mask>
        </defs>

        <rect width="1440" height="900" fill="#030503" />
        <g className="bg-drift">
          <rect width="1440" height="900" fill="url(#glowA)" />
          <rect width="1440" height="900" fill="url(#glowB)" />
        </g>
        <rect width="1440" height="900" fill="url(#dots)" mask="url(#fadeMask)" />

        <g fill="none" strokeLinecap="round">
          {paths.map((d, i) => (
            <g key={i}>
              <path d={d} stroke="#ffffff" strokeOpacity="0.045" strokeWidth="1" />
              <path d={d} stroke={i % 2 ? '#22d3ee' : '#4ade80'} strokeOpacity="0.55" strokeWidth="1.6" className="bg-trail" style={{ animationDelay: `${i * -2.6}s`, animationDuration: `${11 + i * 2}s` }} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
