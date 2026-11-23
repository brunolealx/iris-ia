import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Iris — IA de vendas para WhatsApp e Mercado Livre',
  description: 'Atendimento com IA, CRM, vendas, notas fiscais e planilhas de gestão no seu Google Drive.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-astryx-theme="neutral">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
