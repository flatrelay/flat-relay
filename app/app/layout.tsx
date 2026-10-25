import type { Metadata } from 'next';
import { Anybody, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { ConnectButton } from '@/components/ConnectButton';

// Headlines: Anybody (variable width), slightly widened. Everything else: Hanken Grotesk, normal proportions.
const display = Anybody({ subsets: ['latin'], variable: '--font-display', axes: ['wdth'] });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'FLAT//RELAY',
  description: 'Send $WIF as something to play. Fund a gift, share a link, and whoever lands the sun claims it on Robinhood Chain.',
};

function Wordmark() {
  return (
    <Link href="/" className="group flex items-end gap-2.5" aria-label="FLAT//RELAY home">
      <span aria-hidden className="relative block h-5 w-7">
        <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
        <span className="absolute bottom-0 left-1/2 h-3 w-6 -translate-x-1/2 rounded-t-full bg-flat transition-transform group-hover:-translate-y-0.5" />
      </span>
      <span className="text-sm font-semibold leading-none tracking-wide">FLAT//RELAY</span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink font-body text-white antialiased">
        <Providers>
          <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5">
            <Wordmark />
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
