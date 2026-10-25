import { formatUnits } from 'viem';
import { DEPLOYMENTS, blockTimes, fetchActivity, isTeam, type ActivityItem } from '@/lib/relay';
import { explorerAddress, explorerTx } from '@/lib/chains';
import { buildRelayGraph, relayChains, widestReach, withoutWallets, type RelayChain } from '@/lib/relaymap';
import { RelayMap } from '@/components/RelayMap';
import { LeaderboardTabs } from '@/components/LeaderboardTabs';

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
  // Leaderboards rank outside wallets only: our own gifts and claims are taken out first.
  const outside = withoutWallets(items, isTeam);
  const chains = relayChains(outside, 5);
  const reach = widestReach(outside, 5);
  // Hand-offs involving our own wallets (every step touches one), shown separately and never ranked.
  const testChains = relayChains(items, 8).filter((c) => c.wallets.slice(1).every((w, k) => isTeam(w) || isTeam(c.wallets[k])));
  const burnedOf = new Map(funded.map((f) => [f.campaignId.toString(), f.kind === 'funded' ? f.burned : 0n]));
  const burnedBy = (gifts: string[]) => gifts.reduce((s, g) => s + (burnedOf.get(g) ?? 0n), 0n);
  const outsideBurned = outside.reduce((s, i) => s + (i.kind === 'funded' ? i.burned : 0n), 0n);

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

      <h2 id="leaderboard" className="mt-14 text-xl font-semibold"><span id="chains" />Leaderboard</h2>
      <p className="mt-2 max-w-2xl text-muted">
        Who’s passing $WIF on furthest. Counted from on-chain claims only. Our own team, test and relayer wallets are
        left out, and the rankings count addresses, not people: one person can use many.
      </p>
      <p className="mt-2 font-mono text-sm text-muted">
        {fmt(outsideBurned)} $WIF burned by gifts from outside wallets · each gift burns 1% on top, so every time $WIF is passed on, more is burned
      </p>
      <LeaderboardTabs
        tabs={[
          {
            id: 'chains',
            label: 'Longest chains',
            panel: (
              <>
                <p className="max-w-2xl text-sm text-muted">
                  A chain grows when someone claims a gift, then funds a gift of their own that someone else claims. Ranked by hand-offs.
                </p>
                {chains.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-white/30 p-4 text-muted">
                    No outside chains yet. The first person to claim a gift and pass one on starts the board.
                  </p>
                ) : (
                  <ChainList chains={chains} burnedBy={burnedBy} />
                )}
              </>
            ),
          },
          {
            id: 'reach',
            label: 'Widest reach',
            panel: (
              <>
                <p className="max-w-2xl text-sm text-muted">
                  How many different wallets a gift reached in the end: its own claimers, plus everyone reached by gifts they
                  funded afterwards, and so on.
                </p>
                {reach.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-white/30 p-4 text-muted">
                    No claimed gifts from outside wallets yet. Fund one and it’s ranked here by how far it travels.
                  </p>
                ) : (
                  <ol className="mt-4 divide-y divide-white/20 border-y border-white/20">
                    {reach.map((r, i) => (
                      <li key={r.gift} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
                        <span className="font-wide text-2xl text-flat">{i + 1}</span>
                        <span className="font-semibold">{r.reached} wallet{r.reached === 1 ? '' : 's'} reached</span>
                        <span className="text-sm text-muted">
                          gift #{r.gift} by <span className="font-mono">{short(r.creator)}</span> · {r.generations} generation{r.generations === 1 ? '' : 's'}
                          {r.gifts.length > 1 && <> · via gifts {r.gifts.map((g) => `#${g}`).join(', ')}</>}
                        </span>
                        <span className="font-mono text-sm text-muted">{fmt(r.burned)} $WIF burned</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ),
          },
        ]}
      />
      {testChains.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted hover:text-white">Show gifts from our own wallets and test runs (not ranked) ▾</summary>
          <ChainList chains={testChains} burnedBy={burnedBy} team />
        </details>
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

function ChainList({ chains, burnedBy, team = false }: { chains: RelayChain[]; burnedBy: (gifts: string[]) => bigint; team?: boolean }) {
  return (
    <ol className="mt-4 divide-y divide-white/20 border-y border-white/20">
      {chains.map((c, i) => (
        <li key={c.wallets.join('>')} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
          <span className={`font-wide text-2xl ${team ? 'text-muted' : 'text-flat'}`}>{team ? '·' : i + 1}</span>
          <span className="font-semibold">{c.hops} hand-off{c.hops === 1 ? '' : 's'}</span>
          <span className="break-all font-mono text-sm text-muted">{c.wallets.map(short).join(' → ')}</span>
          <span className="text-sm text-muted">gifts {c.gifts.map((g) => `#${g}`).join(', ')}</span>
          <span className="font-mono text-sm text-muted">{fmt(burnedBy(c.gifts))} $WIF burned</span>
          {team && (c.wallets.every(isTeam) ? <TeamTag /> : (
            <span className="rounded border border-white/45 px-1.5 py-0.5 text-xs text-white" title="Sent from one of our wallets, so not ranked">from our wallet</span>
          ))}
        </li>
      ))}
    </ol>
  );
}

function TeamTag() {
  return <span className="rounded border border-white/45 px-1.5 py-0.5 text-xs text-white" title="Our own wallets, used for testing">team test</span>;
}
