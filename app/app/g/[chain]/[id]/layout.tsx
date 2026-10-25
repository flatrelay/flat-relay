import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'You’ve been sent a $WIF gift',
  description: 'Open it, play (or skip) the game, and claim gas-free on Robinhood Chain.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
