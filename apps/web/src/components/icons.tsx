// Ícones de linha próprios da Iris (24px, traço 1.75). Sem emojis.
import { useId, type SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const IconChat = (p: P) => (
  <svg {...base(p)}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
);
export const IconCart = (p: P) => (
  <svg {...base(p)}><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>
);
export const IconCatalog = (p: P) => (
  <svg {...base(p)}><path d="M12 3 4 7l8 4 8-4z" /><path d="m4 12 8 4 8-4" /><path d="m4 17 8 4 8-4" /></svg>
);
export const IconInvoice = (p: P) => (
  <svg {...base(p)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></svg>
);
export const IconSheet = (p: P) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9.5h16M4 14.5h16M10 9.5V20" /></svg>
);
export const IconFunnel = (p: P) => (
  <svg {...base(p)}><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" /></svg>
);
export const IconApi = (p: P) => (
  <svg {...base(p)}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}><path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base(p)}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.2A5.5 5.5 0 0 1 20.5 19" /></svg>
);
export const IconSpark = (p: P) => (
  <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2.5" /><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" /></svg>
);
export const IconPlug = (p: P) => (
  <svg {...base(p)}><path d="M9 3v4M15 3v4M6.5 7h11v3.5A5.5 5.5 0 0 1 12 16a5.5 5.5 0 0 1-5.5-5.5z" /><path d="M12 16v5" /></svg>
);
export const IconCard = (p: P) => (
  <svg {...base(p)}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3.5" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base({ size: 16, strokeWidth: 2.25, ...p })}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconArrow = (p: P) => (
  <svg {...base({ size: 18, ...p })}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconDrive = (p: P) => (
  <svg {...base(p)}><path d="M8.5 4h7l5.5 9.5-3.5 6h-11L3 13.5z" /><path d="M8.5 4 14 13.5h7M3 13.5h11l-3.5 6" /></svg>
);

/** Marca da Iris: íris de olho verde com anel técnico. Mesmo desenho do favicon (app/icon.svg). */
export function IrisMark({ size = 26 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <radialGradient id={id} cx="16" cy="16" r="12" gradientUnits="userSpaceOnUse">
          <stop offset="0.3" stopColor="#d4b04f"/>
          <stop offset="0.45" stopColor="#7fd36b"/>
          <stop offset="0.75" stopColor="#16a34a"/>
          <stop offset="1" stopColor="#052e16"/>
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#050805"/>
      <path d="M29.40 16.00L30.60 16.00 M28.94 19.47L29.52 19.62 M27.60 22.70L28.12 23.00 M25.48 25.48L25.90 25.90 M22.70 27.60L23.00 28.12 M19.47 28.94L19.62 29.52 M16.00 29.40L16.00 30.60 M12.53 28.94L12.38 29.52 M9.30 27.60L9.00 28.12 M6.52 25.48L6.10 25.90 M4.40 22.70L3.88 23.00 M3.06 19.47L2.48 19.62 M2.60 16.00L1.40 16.00 M3.06 12.53L2.48 12.38 M4.40 9.30L3.88 9.00 M6.52 6.52L6.10 6.10 M9.30 4.40L9.00 3.88 M12.53 3.06L12.38 2.48 M16.00 2.60L16.00 1.40 M19.47 3.06L19.62 2.48 M22.70 4.40L23.00 3.88 M25.48 6.52L25.90 6.10 M27.60 9.30L28.12 9.00 M28.94 12.53L29.52 12.38" stroke="#4ade80" strokeOpacity="0.55" strokeWidth="0.7" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="11.6" fill={`url(#${id})`}/>
      <path d="M20.60 15.86L27.19 15.66 M20.49 16.98L25.97 18.17 M20.37 17.44L25.69 19.20 M19.89 18.46L25.47 21.98 M19.61 18.85L24.01 22.32 M18.81 19.64L22.24 24.07 M18.42 19.91L21.89 25.53 M17.40 20.38L19.10 25.72 M16.93 20.50L18.07 25.99 M15.82 20.60L15.55 27.19 M15.34 20.55L14.53 26.09 M14.26 20.26L12.13 25.44 M13.82 20.05L10.69 25.86 M12.90 19.40L9.14 23.55 M12.57 19.06L8.39 22.79 M11.93 18.14L6.08 21.21 M11.73 17.70L6.52 19.77 M11.44 16.62L5.89 17.37 M11.40 16.14L4.81 16.34 M11.51 15.02L6.03 13.83 M11.63 14.56L6.31 12.80 M12.11 13.54L6.53 10.02 M12.39 13.15L7.99 9.68 M13.19 12.36L9.76 7.93 M13.58 12.09L10.11 6.47 M14.60 11.62L12.90 6.28 M15.07 11.50L13.93 6.01 M16.18 11.40L16.45 4.81 M16.66 11.45L17.47 5.91 M17.74 11.74L19.87 6.56 M18.18 11.95L21.31 6.14 M19.10 12.60L22.86 8.45 M19.43 12.94L23.61 9.21 M20.07 13.86L25.92 10.79 M20.27 14.30L25.48 12.23 M20.56 15.38L26.11 14.63" stroke="#d9f99d" strokeOpacity="0.35" strokeWidth="0.45" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="11.6" fill="none" stroke="#021a0b" strokeWidth="1.1"/>
      <circle cx="16" cy="16" r="7.3" fill="none" stroke="#ecfccb" strokeOpacity="0.35" strokeWidth="0.6"/>
      <circle cx="16" cy="16" r="4.4" fill="#000"/>
      <ellipse cx="13.6" cy="13.2" rx="1.6" ry="1.1" fill="#fff" transform="rotate(-28 13.6 13.2)"/>
      <circle cx="18.2" cy="17.8" r="0.55" fill="#fff" fillOpacity="0.6"/>
    </svg>
  );
}
