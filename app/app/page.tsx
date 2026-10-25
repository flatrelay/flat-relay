import Link from 'next/link';
import { formatUnits } from 'viem';
import { fetchActivity } from '@/lib/relay';

export const revalidate = 60;

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function liveLine(): Promise<string | null> {
  try {
    const items = await fetchActivity(4663);
    const gifts = items.filter((i) => i.kind === 'funded');
    const claims = items.filter((i) => i.kind === 'claimed');
    if (!gifts.length) return null;
    const claimed = claims.reduce((s, i) => s + i.amount, 0n);
    const burned = gifts.reduce((s, i) => s + (i.kind === 'funded' ? i.burned : 0n), 0n);
    return `So far on mainnet: ${gifts.length} gift${gifts.length === 1 ? '' : 's'}, ${fmt(claimed)} $WIF claimed, ${fmt(burned)} $WIF burned.`;
  } catch {
    return null;
  }
}

export default async function Home() {
  const live = await liveLine();
  return (
    <>
      <section className="pt-14 sm:pt-24">
        <h1 className="font-wide max-w-4xl text-[2.6rem] leading-[1.04] sm:text-7xl">
          Send $WIF as something to play.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Fund a gift and share the link. Whoever lands the sun on the horizon claims it, with no gas and no wallet app
          needed. Every gift burns 1%.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/create" className="rounded-full bg-flat px-6 py-3 font-semibold text-ink hover:brightness-105">
            Send a gift
          </Link>
          <Link href="/proof" className="rounded-full border border-line px-6 py-3 hover:border-white">
            See every transaction
          </Link>
        </div>
      </section>

      {/* The horizon: full-bleed, the sun crosses once and settles. */}
      <div aria-hidden className="relative left-1/2 mt-20 h-40 w-screen -translate-x-1/2 overflow-x-clip sm:mt-24 sm:h-56">
        <div className="absolute inset-x-0 bottom-0 top-1/2 bg-panel" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-white" />
        <div className="animate-crossing absolute top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-flat shadow-[0_0_60px_18px_rgba(255,197,46,0.35)] sm:h-24 sm:w-24" />
      </div>

      <section className="grid gap-10 pt-12 sm:grid-cols-3">
        <Step n="1" title="Fund it">Pick an amount and how many people can claim. It sits in an escrow contract nobody else can touch.</Step>
        <Step n="2" title="Share the link">The link carries the key. Send it in a DM, a group chat or a stream.</Step>
        <Step n="3" title="Land the sun">They play a 20-second game, paste any address and claim. Unclaimed $WIF returns to you.</Step>
      </section>

      {live && <p className="mt-14 text-muted">{live}</p>}
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-wide text-flat">{n}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted">{children}</p>
    </div>
  );
}
