import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: "Orc'estra Prospect", template: "%s · Orc'estra Prospect" },
  icons: { icon: '/brand/icone-orcestra.png', apple: '/brand/icone-orcestra.png' },
  description: 'Plataforma interna de prospecção B2B de Empresas Juniores',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#014E18' },
    { media: '(prefers-color-scheme: dark)', color: '#003D0D' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
