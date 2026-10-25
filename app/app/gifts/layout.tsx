import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My gifts',
  description: 'Gifts you funded: who claimed them, where they went next, and reclaiming what is left after expiry.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
