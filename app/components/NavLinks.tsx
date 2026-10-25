'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/play', label: 'Try it' },
  { href: '/create', label: 'Send' },
  { href: '/gifts', label: 'My gifts' },
  { href: '/proof', label: 'Proof' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const current = path === l.href;
        return (
          <Link key={l.href} href={l.href} aria-current={current ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center ${current ? 'text-white underline decoration-flat decoration-2 underline-offset-8' : 'hover:text-white'}`}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
