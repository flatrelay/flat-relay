import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { ConnectButton } from '@/components/ConnectButton';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'FLAT//RELAY',
  description: 'Send $WIF as something to play, not just a transfer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink text-white font-display antialiased">
        <Providers>
          <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
            <Link href="/" className="font-mono text-sm tracking-widest">
              FLAT<span className="text-flat">//</span>RELAY
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/create" className="hover:text-white">Send</Link>
              <Link href="/proof" className="hover:text-white">Proof</Link>
              <ConnectButton />
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 pb-24">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
