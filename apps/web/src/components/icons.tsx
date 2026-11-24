// Ícones de linha próprios da Iris (24px, traço 1.75). Sem emojis.
import type { SVGProps } from 'react';

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
export const IconFactory = (p: P) => (
  <svg {...base(p)}><path d="M3 20V10l5 3V10l5 3V5h4v15z" /><path d="M7 17h2M11.5 17h2" /></svg>
);

/** Marca da Iris: arco-íris estilizado em três faixas (verde, ciano, azul). */
export function IrisMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0b130d" />
      <path d="M7 22a9 9 0 0 1 18 0" fill="none" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M11 22a5 5 0 0 1 10 0" fill="none" stroke="#25d0e8" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="16" cy="22" r="1.9" fill="#ffffff" />
    </svg>
  );
}
