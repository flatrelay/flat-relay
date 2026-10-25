import { formatUnits } from 'viem';
import { DEPLOYMENTS, fetchActivity, type ActivityItem } from '@/lib/relay';
import { explorerAddress, explorerTx } from '@/lib/chains';

export const revalidate = 30; // seconds; data comes straight from the chain

const CHAIN = 4663 as const;
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const LABEL: Record<ActivityItem['kind'], string> = { funded: 'Funded', claimed: 'Claimed', refunded: 'Refunded' };

export default async function ProofPage() {
  const { escrow, token } = DEPLOYMENTS[CHAIN];
  let items: ActivityItem[] = [];
  let error: string | null = null;
  try {
    items = await fetchActivity(CHAIN);
  } catch (e) {
    error = e instanceof Error ? e.message.split('\n')[0] : 'Could not read the chain';
  }

  const funded = items.filter((i) => i.kind === 'funded');
  const claims = items.filter((i) => i.kind === 'claimed');
  const totalBurned = funded.reduce((s, i) => s + (i.kind === 'funded' ? i.burned : 0n), 0n);
  const totalClaimed = claims.reduce((s, i) => s + i.amount, 0n);
  const wallets = new Set(claims.map((c) => c.actor.toLowerCase())).size;

  return (
    <section className="pt-10">
      <h1 className="font-wide text-4xl">Every gift, on chain</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Every number here is read directly from the{' '}
        <a className="text-white underline decoration-line hover:decoration-flat" href={explorerAddress(CHAIN, escrow)} target="_blank" rel="noreferrer">
          RelayEscrow contract
        </a>{' '}
        on Robinhood Chain. No database, no estimates.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          ['Campaigns', funded.length.toString()],
          ['Claims', claims.length.toString()],
          ['$WIF claimed', fmt(totalClaimed)],
          ['$WIF burned', fmt(totalBurned)],
        ].map(([k, v]) => (
          <div key={k} className="bg-panel p-5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-2 font-mono text-2xl">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">{wallets} unique claiming wallet{wallets === 1 ? '' : 's'}.</p>

      {error && <p className="mt-6 rounded-xl border border-red-500/40 p-4 text-red-300">Chain read failed: {error}</p>}

      <ol className="mt-10 divide-y divide-line border-y border-line">
        {items.length === 0 && !error && <li className="py-6 text-muted">No activity yet.</li>}
        {items.map((i) => (
          <li key={`${i.tx}-${i.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-4">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${i.kind === 'claimed' ? 'bg-flat text-ink' : 'border border-line text-muted'}`}>
                {LABEL[i.kind]}
              </span>
              <span className="font-mono text-sm">#{i.campaignId.toString()}</span>
              <span className="text-sm text-muted">{short(i.actor)}</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-sm">
              <span>
                {fmt(i.amount)} $WIF{i.kind === 'funded' && <span className="text-muted">, {fmt(i.burned)} burned</span>}
              </span>
              <a className="text-muted hover:text-flat" href={explorerTx(CHAIN, i.tx)} target="_blank" rel="noreferrer">
                tx ↗
              </a>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-xs text-muted">
        Escrow contract {short(escrow)} and $WIF token {short(token)}, on Robinhood Chain (4663).
      </p>
    </section>
  );
}
