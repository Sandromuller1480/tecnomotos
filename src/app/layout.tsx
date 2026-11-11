import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  applicationName: 'TECNOMOTOS',
  title: 'TECNOMOTOS | Desempenho, Peças e Serviços para Motocicletas',
  description: 'A melhor oficina e loja virtual de peças de alto desempenho para motos. Estilo MotoGP e engenharia mecânica de alto padrão.',
  appleWebApp: {
    capable: true,
    title: 'TECNOMOTOS',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-brand-black text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
