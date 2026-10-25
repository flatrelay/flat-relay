import Link from 'next/link';
import { formatUnits } from 'viem';
import { fetchActivity } from '@/lib/relay';
import { HorizonSun } from '@/components/HorizonSun';
import { DemoVideo } from '@/components/DemoVideo';

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
    return `So far on mainnet, including our own test gifts: ${gifts.length} gift${gifts.length === 1 ? '' : 's'}, ${fmt(claimed)} $WIF claimed, ${fmt(burned)} $WIF burned.`;
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
          <span className="block">Land the sun.</span>
          <span className="block text-flat">Keep the $WIF.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Send $WIF as a link your friends play to open. They claim it gas-free, with no wallet app needed, then pass it on.
          Every gift burns 1% of its $WIF.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/create" className="inline-flex min-h-11 items-center rounded-full bg-flat px-6 py-3 font-semibold text-ink hover:brightness-105">
            Send a gift
          </Link>
          <Link href="/play" className="inline-flex min-h-11 items-center rounded-full border border-white/50 px-6 py-3 hover:border-flat">
            Try the game, free
          </Link>
          <Link href="/proof" className="inline-flex min-h-11 items-center px-2 py-3 text-muted underline decoration-white/40 underline-offset-4 hover:text-white">
            See every transaction
          </Link>
        </div>
        <DemoVideo />
      </section>

      {/* The horizon: full-bleed. The sun rises in and drifts; touch it and it is pushed away from where you touched (sideways, or bounced up / dipped down). */}
      <div aria-hidden className="relative select-none left-1/2 mt-20 h-40 w-screen -translate-x-1/2 overflow-x-clip sm:mt-24 sm:h-56">
        <div className="absolute inset-x-0 bottom-0 top-1/2 bg-panel" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-white" />
        <HorizonSun />
      </div>

      <section className="grid gap-10 pt-12 sm:grid-cols-3">
        <Step n="1" title="Fund it">Pick an amount and how many people can claim. It waits in an escrow contract with no admin: only people with your link, or you after it expires, can move it.</Step>
        <Step n="2" title="Share the link">The link is the key: anyone who has it can claim, first come, first served. Send it privately.</Step>
        <Step n="3" title="Land the sun">They play a 20-second game (or skip it), paste their Robinhood Chain address and claim. After expiry, you can reclaim whatever is left.</Step>
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
