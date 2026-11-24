// Fundo do site: arte de íris em SVG, leve (sem JavaScript, poucos elementos).
// As "fibras" da íris são círculos com traço largo e tracejado: cada traço vira
// um raio, então centenas de fibras saem de um único elemento.
// Só o anel técnico gira devagar (CSS no elemento inteiro, roda na GPU).

export function TechBackground() {
  return (
    <div className="bg-tech" aria-hidden>
      <div className="bg-gradient" />

      <svg className="iris-art" viewBox="-500 -500 1000 1000">
        <defs>
          <radialGradient id="iaFill" r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform="scale(330)">
            <stop offset="0.24" stopColor="#c9a646" />
            <stop offset="0.33" stopColor="#8fcf62" />
            <stop offset="0.5" stopColor="#2fbf62" />
            <stop offset="0.7" stopColor="#15803d" />
            <stop offset="0.88" stopColor="#0a4f27" />
            <stop offset="1" stopColor="#03160b" />
          </radialGradient>
          <radialGradient id="iaHalo" r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform="scale(500)">
            <stop offset="0.6" stopColor="#22c55e" stopOpacity="0.22" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="iaLimb" r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform="scale(332)">
            <stop offset="0.78" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#010603" stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id="iaPupil" r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform="scale(104)">
            <stop offset="0.82" stopColor="#010402" />
            <stop offset="1" stopColor="#010402" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="iaGlint" r="1" cx="0" cy="0" gradientUnits="userSpaceOnUse" gradientTransform="translate(-62 -78) scale(46 30)">
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle r="500" fill="url(#iaHalo)" />
        <circle r="330" fill="url(#iaFill)" />

        {/* fibras: escuras (profundidade) e claras (estroma) */}
        <g fill="none">
          <circle r="205" stroke="#052e16" strokeOpacity="0.45" strokeWidth="230" strokeDasharray="0.9 3.6 1.7 5.9" />
          <circle r="210" stroke="#bbf7d0" strokeOpacity="0.2" strokeWidth="240" strokeDasharray="1.1 4.9" strokeDashoffset="2" />
          <circle r="215" stroke="#d9f99d" strokeOpacity="0.12" strokeWidth="200" strokeDasharray="0.5 7.3 0.9 3.1" strokeDashoffset="5" />
          {/* raios dourados perto da pupila */}
          <circle r="128" stroke="#f59e0b" strokeOpacity="0.32" strokeWidth="80" strokeDasharray="0.8 2.6" />
          <circle r="140" stroke="#fde68a" strokeOpacity="0.18" strokeWidth="70" strokeDasharray="0.5 3.9" strokeDashoffset="1.5" />
          {/* colarete e sulcos de contração */}
          <circle r="158" stroke="#ecfccb" strokeOpacity="0.3" strokeWidth="3" strokeDasharray="22 7 11 5 30 9" />
          <circle r="250" stroke="#021a0b" strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="60 28 24 40" />
          <circle r="276" stroke="#021a0b" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="90 22 40 36" strokeDashoffset="30" />
          <circle r="300" stroke="#021a0b" strokeOpacity="0.28" strokeWidth="2" strokeDasharray="44 30 70 24" strokeDashoffset="12" />
        </g>

        <circle r="332" fill="url(#iaLimb)" />
        <circle r="331" fill="none" stroke="#021a0b" strokeWidth="5" />
        <circle r="104" fill="url(#iaPupil)" />
        <circle r="96" fill="none" stroke="#3b1d06" strokeOpacity="0.7" strokeWidth="4" strokeDasharray="3 2 5 2" />
        <ellipse cx="-62" cy="-78" rx="46" ry="30" fill="url(#iaGlint)" transform="rotate(-28 -62 -78)" />
      </svg>

      {/* anel técnico: gira devagar como um todo (barato) */}
      <svg className="iris-art iris-ring" viewBox="-500 -500 1000 1000" fill="none">
        <circle r="372" stroke="#4ade80" strokeOpacity="0.4" strokeWidth="14" strokeDasharray="1.2 11.8" />
        <circle r="372" stroke="#4ade80" strokeOpacity="0.7" strokeWidth="26" strokeDasharray="2.4 192.4" />
        <circle r="404" stroke="#22d3ee" strokeOpacity="0.32" strokeWidth="1.6" strokeDasharray="150 46 14 46" />
        <circle r="428" stroke="#4ade80" strokeOpacity="0.14" strokeWidth="1.2" strokeDasharray="3 11" />
      </svg>

      <div className="bg-vignette" />
    </div>
  );
}
