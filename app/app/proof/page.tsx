import { formatUnits } from 'viem';
import { DEPLOYMENTS, blockTimes, fetchActivity, isTeam, type ActivityItem } from '@/lib/relay';
import { explorerAddress, explorerTx } from '@/lib/chains';
import { buildRelayGraph, relayChains } from '@/lib/relaymap';
import { RelayMap } from '@/components/RelayMap';

export const metadata = { title: 'Proof', description: 'Every FLAT//RELAY gift, claim, burn and reclaim, read directly from the RelayEscrow contract on Robinhood Chain.' };

export const revalidate = 30; // seconds; data comes straight from the chain

const CHAIN = 4663 as const;
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const LABEL: Record<ActivityItem['kind'], string> = { funded: 'Gift funded', claimed: 'Claimed', refunded: 'Reclaimed' };
const TX_NAME: Record<ActivityItem['kind'], string> = { funded: 'funding', claimed: 'claim', refunded: 'reclaim' };

function when(t?: number) {
  if (!t) return null;
  const d = new Date(t * 1000);
  return { iso: d.toISOString(), text: d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' };
}

export default async function ProofPage() {
  const { escrow, token } = DEPLOYMENTS[CHAIN];
  let items: ActivityItem[] = [];
  let error: string | null = null;
  try {
    items = await fetchActivity(CHAIN);
  } catch (e) {
    error = e instanceof Error ? e.message.split('\n')[0] : 'Could not read the chain';
  }
  const shown = items.slice(0, 100);
  const times = await blockTimes(CHAIN, shown.map((i) => i.block)).catch(() => new Map<bigint, number>());

  const funded = items.filter((i) => i.kind === 'funded');
  const claims = items.filter((i) => i.kind === 'claimed');
  const totalBurned = funded.reduce((s, i) => s + (i.kind === 'funded' ? i.burned : 0n), 0n);
  const totalClaimed = claims.reduce((s, i) => s + i.amount, 0n);
  const wallets = new Set(claims.map((c) => c.actor.toLowerCase())).size;
  const teamEvents = items.filter((i) => isTeam(i.actor)).length;
  const graph = buildRelayGraph(items);
  const chains = relayChains(items, 5);

  return (
    <section className="pt-10">
      <h1 className="font-wide text-4xl">Every gift, on chain</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Every number here is read directly from the{' '}
        <a className="text-white underline decoration-white/40 hover:decoration-flat" href={explorerAddress(CHAIN, escrow)} target="_blank" rel="noreferrer">
          RelayEscrow contract<span className="sr-only"> (opens Blockscout)</span>
        </a>{' '}
        on Robinhood Chain mainnet. No database, no estimates.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/30 bg-white/30 sm:grid-cols-4">
        {[
          ['Gifts funded', funded.length.toString(), 'Gifts created and paid for'],
          ['Claims', claims.length.toString(), 'Each to a different address per gift'],
          ['$WIF claimed', fmt(totalClaimed), 'Paid out to claimers'],
          ['$WIF burned', fmt(totalBurned), '1% of each gift, at creation'],
        ].map(([k, v, d]) => (
          <div key={k} className="bg-panel p-5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-2 font-mono text-2xl">{v}</dd>
            <dd className="mt-1 text-sm text-muted">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">
        {wallets} different claiming address{wallets === 1 ? '' : 'es'}. Addresses aren’t verified people: one person can use many.{' '}
        {teamEvents > 0 && <>{teamEvents} of {items.length} events are our own testing, marked <TeamTag /> below.</>}
      </p>

      {error && <p role="alert" className="mt-6 rounded-xl border border-alert/60 p-4 text-white">Couldn’t read the chain just now: {error}. Refresh in a minute.</p>}

      <h2 id="map" className="mt-14 text-xl font-semibold">Relay map</h2>
      <p className="mt-2 max-w-2xl text-muted">
        Who gifted whom. Each line is one or more claims, left to right by generation. Yellow wallets have sent a gift;
        the bigger dots received one first and then passed it on.
      </p>
      <p className="mt-2 font-mono text-sm text-muted">
        {graph.nodes.length} wallets · {graph.edges.length} hand-off{graph.edges.length === 1 ? '' : 's'} · {graph.relayers} passed it on
        {graph.selfClaims > 0 && ` · ${graph.selfClaims} self-claim${graph.selfClaims === 1 ? '' : 's'} not drawn`}
      </p>
      <div className="mt-4">
        <RelayMap graph={graph} chain={CHAIN} />
      </div>

      <h2 id="chains" className="mt-14 text-xl font-semibold">Longest relay chains</h2>
      <p className="mt-2 max-w-2xl text-muted">
        A chain grows when someone claims a gift and then funds a gift of their own that someone else claims. Ranked by
        hand-offs.
      </p>
      {chains.length === 0 ? (
        <p className="mt-4 text-muted">No hand-offs yet.</p>
      ) : (
        <ol className="mt-4 divide-y divide-white/20 border-y border-white/20">
          {chains.map((c, i) => {
            const team = c.wallets.every(isTeam);
            return (
              <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
                <span className="font-wide text-2xl text-flat">{i + 1}</span>
                <span className="font-semibold">{c.hops} hand-off{c.hops === 1 ? '' : 's'}</span>
                <span className="break-all font-mono text-sm text-muted">{c.wallets.map(short).join(' → ')}</span>
                <span className="text-sm text-muted">gifts {c.gifts.map((g) => `#${g}`).join(', ')}</span>
                {team && <TeamTag />}
              </li>
            );
          })}
        </ol>
      )}

      <h2 className="mt-14 text-xl font-semibold">All events</h2>
      <ol className="mt-4 divide-y divide-white/20 border-y border-white/20">
        {items.length === 0 && !error && <li className="py-6 text-muted">No activity yet.</li>}
        {shown.map((i) => {
          const t = when(times.get(i.block));
          return (
            <li key={`${i.tx}-${i.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${i.kind === 'claimed' ? 'bg-flat text-ink' : 'border border-white/45 text-white'}`}>
                  {LABEL[i.kind]}
                </span>
                <span className="font-mono text-sm">#{i.campaignId.toString()}</span>
                <span className="text-sm text-muted">{short(i.actor)}</span>
                {isTeam(i.actor) && <TeamTag />}
                {t && <time dateTime={t.iso} className="text-sm text-muted">{t.text}</time>}
              </div>
              <div className="flex items-center gap-4 font-mono text-sm">
                <span>
                  {i.kind === 'funded' ? <>{fmt(i.amount)} $WIF pool <span className="text-muted">+ {fmt(i.burned)} burned</span></> : <>{fmt(i.amount)} $WIF</>}
                </span>
                <a className="inline-flex min-h-11 items-center text-muted hover:text-flat" href={explorerTx(CHAIN, i.tx)} target="_blank" rel="noreferrer"
                  aria-label={`Gift #${i.campaignId} ${TX_NAME[i.kind]} transaction on Blockscout`}>
                  tx ↗
                </a>
              </div>
            </li>
          );
        })}
      </ol>
      {items.length > shown.length && <p className="mt-2 text-sm text-muted">Showing the latest {shown.length} of {items.length} events.</p>}

      <p className="mt-6 text-sm text-muted">
        Escrow contract {short(escrow)} (source verified on{' '}
        <a className="underline" href={`https://repo.sourcify.dev/${CHAIN}/${escrow}`} target="_blank" rel="noreferrer">Sourcify</a>
        ) and $WIF token {short(token)}, on Robinhood Chain (4663). The contract has no owner or admin and can’t be upgraded.
      </p>
    </section>
  );
}

function TeamTag() {
  return <span className="rounded border border-white/45 px-1.5 py-0.5 text-xs text-white" title="Our own wallets, used for testing">team test</span>;
}
