import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Iris — IA de vendas para WhatsApp e Mercado Livre',
  description: 'Atendimento com IA, CRM, vendas, notas fiscais e planilhas de gestão no seu Google Drive.',
};

export const viewport: Viewport = { themeColor: '#030503', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
