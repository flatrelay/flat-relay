'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address, type Hex } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { explorerTx, type SupportedChainId } from '@/lib/chains';
import { DEPLOYMENTS, escrowAbi, publicClient } from '@/lib/relay';
import { friendlyError, isSupportedChain } from '@/lib/gift';

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
        Gifts you funded from this wallet. When a gift expires, any $WIF nobody claimed can come back to you.
      </p>
      {chain === 46630 && <p className="mt-3 rounded-lg border border-white/40 px-3 py-2 text-sm text-white">Showing testnet gifts (mWIF).</p>}

      {!isConnected && <p className="mt-10 text-muted">Connect the wallet you created gifts with to see them here.</p>}
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
                    className="mt-3 rounded-full bg-flat px-5 py-2 font-semibold text-ink disabled:opacity-50">
                    {busy === g.id ? 'Confirm in your wallet…' : `Reclaim ${fmt(g.remaining)} ${tokenLabel}`}
                  </button>
                )}
                {!expired && g.remaining > 0n && <p className="mt-2 text-sm text-muted">You can reclaim what&apos;s left once it expires.</p>}
                {msg?.id === g.id && (
                  <p className={`mt-2 text-sm ${msg.tx ? 'text-white' : 'text-alert'}`}>
                    {msg.text}{' '}
                    {msg.tx && <a className="underline" href={explorerTx(chain, msg.tx)} target="_blank" rel="noreferrer">View transaction</a>}
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
