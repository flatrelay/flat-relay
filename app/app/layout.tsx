import type { Metadata } from 'next';
import { Anybody, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { ConnectButton } from '@/components/ConnectButton';
import { NavLinks } from '@/components/NavLinks';

// Headlines: Anybody (variable width), slightly widened. Everything else: Hanken Grotesk, normal proportions.
const display = Anybody({ subsets: ['latin'], variable: '--font-display', axes: ['wdth'] });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://flat-relay.vercel.app'),
  title: { default: 'FLAT//RELAY: land the sun, keep the $WIF', template: '%s · FLAT//RELAY' },
  description: 'Send $WIF as a link your friends play to open. Land the sun, claim gas-free on Robinhood Chain, pass it on. Every gift burns 1%.',
  openGraph: { siteName: 'FLAT//RELAY', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

function Wordmark() {
  return (
    <Link href="/" className="group flex items-end gap-2.5" aria-label="FLAT//RELAY home">
      <span aria-hidden className="relative block h-5 w-7">
        <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
        {/* hover: the sun lifts and glows; click: a brighter flash */}
        <span className="absolute bottom-0 left-1/2 h-3 w-6 -translate-x-1/2 rounded-t-full bg-flat transition-[transform,box-shadow,filter] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_0_14px_4px_rgba(255,197,46,0.65)] group-focus-visible:shadow-[0_0_14px_4px_rgba(255,197,46,0.65)] group-active:brightness-125 group-active:shadow-[0_0_22px_8px_rgba(255,197,46,0.9)]" />
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
          {/* Phone: wordmark + wallet on row one, page links on row two. Desktop: one row. */}
          <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5">
            <Wordmark />
            <nav aria-label="Main" className="order-3 flex w-full gap-5 whitespace-nowrap text-sm text-muted sm:order-2 sm:ml-auto sm:w-auto">
              <NavLinks />
            </nav>
            <div className="order-2 whitespace-nowrap text-sm sm:order-3">
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 pb-24">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
