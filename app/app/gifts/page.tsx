'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address, type Hex } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { explorerTx, type SupportedChainId } from '@/lib/chains';
import { DEPLOYMENTS, escrowAbi, fromJSON, publicClient, type ActivityItem, type ActivityJSON } from '@/lib/relay';
import { friendlyError, isSupportedChain } from '@/lib/gift';
import { downstream } from '@/lib/relaymap';
import { ConnectButton } from '@/components/ConnectButton';

type Gift = {
  id: bigint; creator: Address; expiry: bigint; maxClaims: number; claimCount: number;
  perClaim: bigint; remaining: bigint;
};

const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });

function when(expiry: bigint) {
  const ms = Number(expiry) * 1000;
  const d = new Date(ms);
  const left = ms - Date.now();
  const date = d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (left <= 0) return `Expired ${date}`;
  const h = Math.floor(left / 3_600_000);
  return h >= 48 ? `Expires ${date}` : h >= 1 ? `Expires in ${h} h` : `Expires in ${Math.max(1, Math.round(left / 60_000))} min`;
}

export default function MyGiftsPage() {
  const { address, chainId: walletChain, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const chain: SupportedChainId = isSupportedChain(walletChain) ? walletChain : 4663;
  const { escrow, tokenLabel } = DEPLOYMENTS[chain];

  const [gifts, setGifts] = useState<Gift[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<bigint | null>(null);
  const [msg, setMsg] = useState<{ id: bigint; text: string; tx?: Hex } | null>(null);
  const [activity, setActivity] = useState<{ items: ActivityItem[]; times: Map<string, number> } | null>(null);

  // Public event history (claims and onward gifts), for "Where it went".
  useEffect(() => {
    if (!address) return;
    fetch(`/api/activity?chain=${chain}`)
      .then((r) => r.json())
      .then((j: { items?: ActivityJSON[] }) => {
        const list = j.items ?? [];
        setActivity({ items: list.map(fromJSON), times: new Map(list.map((x) => [x.tx + x.kind, x.time ?? 0])) });
      })
      .catch(() => setActivity({ items: [], times: new Map() }));
  }, [address, chain]);

  // Reads campaign state straight from the contract: campaignCount, then getCampaign for each.
  const load = useCallback(async () => {
    if (!address) return;
    setLoadErr(null);
    try {
      const client = publicClient(chain);
      const count = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'campaignCount' });
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      const all = await Promise.all(
        ids.map(async (id) => ({ id, ...(await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getCampaign', args: [id] })) })),
      );
      setGifts(all.filter((g) => g.creator.toLowerCase() === address.toLowerCase()).reverse() as Gift[]);
    } catch (e) {
      setLoadErr(friendlyError(e));
    }
  }, [address, chain, escrow]);

  useEffect(() => { setGifts(null); load(); }, [load]);

  async function refund(id: bigint) {
    setBusy(id);
    setMsg(null);
    try {
      if (walletChain !== chain) await switchChainAsync({ chainId: chain });
      const client = publicClient(chain);
      await client.simulateContract({ account: address, address: escrow, abi: escrowAbi, functionName: 'refund', args: [id] });
      const hash = await writeContractAsync({ chainId: chain, address: escrow, abi: escrowAbi, functionName: 'refund', args: [id] });
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== 'success') throw new Error('The refund transaction failed.');
      setMsg({ id, text: 'Reclaimed. The unclaimed $WIF is back in your wallet.', tx: hash });
      await load();
    } catch (e) {
      setMsg({ id, text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto max-w-2xl pt-12">
      <h1 className="font-wide text-4xl">My gifts</h1>
      <p className="mt-3 text-muted">
        Gifts you funded from this wallet, who claimed them and where the $WIF went next. After a gift expires, you can
        reclaim any $WIF nobody claimed. It doesn’t come back automatically.
      </p>
      {chain === 46630 && <p className="mt-3 rounded-lg border border-white/40 px-3 py-2 text-sm text-white">Showing testnet gifts (mWIF).</p>}

      {!isConnected && (
        <div className="mt-10 max-w-sm">
          <p className="mb-4 text-muted">Connect the wallet you created gifts with to see them here.</p>
          <ConnectButton variant="block" />
        </div>
      )}
      {loadErr && <p className="mt-8 rounded-lg border border-alert/50 p-3 text-alert">Couldn&apos;t read your gifts: {loadErr}</p>}
      {isConnected && !gifts && !loadErr && <p className="mt-10 text-muted">Reading your gifts from the chain…</p>}
      {gifts && gifts.length === 0 && (
        <div className="mt-10">
          <p className="text-muted">This wallet hasn&apos;t funded any gifts yet.</p>
          <Link href="/create" className="mt-4 inline-block rounded-full bg-flat px-5 py-2.5 font-semibold text-ink">Send a gift</Link>
        </div>
      )}

      {gifts && gifts.length > 0 && (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {gifts.map((g) => {
            const expired = BigInt(Math.floor(Date.now() / 1000)) >= g.expiry;
            const canRefund = expired && g.remaining > 0n;
            const done = g.remaining === 0n;
            return (
              <li key={g.id.toString()} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-semibold">Gift #{g.id.toString()}</p>
                  <p className="text-sm text-muted">{when(g.expiry)}</p>
                </div>
                <p className="mt-1 text-muted">
                  {g.claimCount} of {g.maxClaims} claimed at {fmt(g.perClaim)} {tokenLabel} each.{' '}
                  {done ? (g.claimCount === g.maxClaims ? 'Fully claimed.' : 'Reclaimed.') : `${fmt(g.remaining)} ${tokenLabel} still in escrow.`}
                </p>
                {canRefund && (
                  <button onClick={() => refund(g.id)} disabled={busy !== null}
                    className="mt-3 min-h-11 rounded-full bg-flat px-5 py-2 font-semibold text-ink disabled:opacity-50">
                    {busy === g.id ? 'Confirm in your wallet…' : `Reclaim ${fmt(g.remaining)} ${tokenLabel}`}
                  </button>
                )}
                {!expired && g.remaining > 0n && <p className="mt-2 text-sm text-muted">You can reclaim what&apos;s left once it expires.</p>}
                <WhereItWent id={g.id} activity={activity} />
                {msg?.id === g.id && (
                  <p role={msg.tx ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.tx ? 'text-white' : 'text-alert'}`}>
                    {msg.text}{' '}
                    {msg.tx && <a className="underline" href={explorerTx(chain, msg.tx)} target="_blank" rel="noreferrer">View reclaim transaction<span className="sr-only"> (opens Blockscout)</span></a>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const shortA = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
function ago(t?: number) {
  if (!t) return '';
  const m = Math.round((Date.now() / 1000 - t) / 60);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

/** Who claimed this gift, and whether each claimer passed $WIF on with a gift of their own. */
function WhereItWent({ id, activity }: { id: bigint; activity: { items: ActivityItem[]; times: Map<string, number> } | null }) {
  if (!activity) return null;
  const claims = activity.items.filter((i) => i.kind === 'claimed' && i.campaignId === id).sort((a, b) => Number(a.block - b.block));
  if (!claims.length) return <p className="mt-3 text-sm text-muted">No claims yet.</p>;
  return (
    <div className="mt-4 rounded-xl border border-white/30 p-4">
      <p className="text-sm font-semibold">Where it went</p>
      <ul className="mt-2 space-y-2 text-sm">
        {claims.map((c) => {
          const d = downstream(activity.items, c.actor, c.block);
          return (
            <li key={c.tx}>
              <span className="font-mono">{shortA(c.actor)}</span>{' '}
              <span className="text-muted">claimed {Number(formatUnits(c.amount, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} · {ago(activity.times.get(c.tx + 'claimed'))}</span>
              <br />
              {d.reached > 0 ? (
                <span className="text-flat">Passed it on: reached {d.reached} more wallet{d.reached === 1 ? '' : 's'}, {d.depth} hand-off{d.depth === 1 ? '' : 's'} deep</span>
              ) : (
                <span className="text-muted">Hasn&apos;t passed it on yet</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-muted">Addresses, not verified people. <Link href="/proof#chains" className="underline">See the longest relay chains</Link>.</p>
    </div>
  );
}
