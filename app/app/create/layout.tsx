import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Send a $WIF gift',
  description: 'Fund a $WIF gift in an escrow on Robinhood Chain and share one link. 1% of the gift is burned.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
