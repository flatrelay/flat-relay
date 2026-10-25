import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Try the game',
  description: 'Practice Flat Line, the game that opens a FLAT//RELAY gift. No wallet, nothing is paid.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
