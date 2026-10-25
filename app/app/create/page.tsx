'use client';

import { useMemo, useState } from 'react';
import { formatUnits, parseEventLogs, parseUnits, type Hex } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { explorerTx, type SupportedChainId } from '@/lib/chains';
import { DEPLOYMENTS, erc20Abi, escrowAbi, publicClient } from '@/lib/relay';
import { TEMPLATES, friendlyError, giftLink, giftMetadataHash, isSupportedChain, newGiftKey, type Template } from '@/lib/gift';

type Step = 'form' | 'approving' | 'creating' | 'done';
const DAYS = [1, 3, 7, 14, 30];
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });

export default function CreatePage() {
  const { address, chainId: walletChain, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const chain: SupportedChainId = isSupportedChain(walletChain) ? walletChain : 4663;
  const { escrow, token, tokenLabel } = DEPLOYMENTS[chain];

  const [per, setPer] = useState('10');
  const [count, setCount] = useState('1');
  const [days, setDays] = useState(7);
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState<Template>('flatline');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [txs, setTxs] = useState<{ label: string; hash: Hex }[]>([]);
  const [copied, setCopied] = useState(false);

  const calc = useMemo(() => {
    try {
      const perClaim = parseUnits(per || '0', 18);
      const n = Number(count);
      if (perClaim <= 0n) return { err: 'Enter a reward above zero.' };
      if (!Number.isInteger(n) || n < 1 || n > 10_000) return { err: 'Claims must be a whole number from 1 to 10,000.' };
      const pool = perClaim * BigInt(n);
      const burn = pool / 100n; // mirrors RelayEscrow.fundingRequired (BURN_BPS = 100)
      if (burn === 0n) return { err: 'Total too small to burn 1%.' };
      return { perClaim, n, pool, burn, total: pool + burn };
    } catch {
      return { err: 'Enter a valid number.' };
    }
  }, [per, count]);

  async function create() {
    if (!address || 'err' in calc) return;
    setError(null);
    const { perClaim, n, total } = calc as Exclude<typeof calc, { err: string }>;
    try {
      if (walletChain !== chain) await switchChainAsync({ chainId: chain });
      const client = publicClient(chain);

      const bal = await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
      if (bal < total) throw new Error(`You need ${fmt(total)} ${tokenLabel} but hold ${fmt(bal)}.`);

      // The gift key exists only in this tab until it is put in the link.
      const { pk, signer } = newGiftKey();
      try { sessionStorage.setItem('flatrelay:pendingGift', JSON.stringify({ pk, chain, message })); } catch {}

      const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [address, escrow] });
      if (allowance < total) {
        setStep('approving');
        const h = await writeContractAsync({ chainId: chain, address: token, abi: erc20Abi, functionName: 'approve', args: [escrow, total] }); // exact, never unlimited
        setTxs((t) => [...t, { label: 'Approve', hash: h }]);
        const r = await client.waitForTransactionReceipt({ hash: h });
        if (r.status !== 'success') throw new Error('Approval failed.');
      }

      setStep('creating');
      const safety = days === 30 ? 3600 : 0; // stay inside the contract's 30-day limit
      const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86400 - safety);
      const h2 = await writeContractAsync({
        chainId: chain, address: escrow, abi: escrowAbi, functionName: 'createCampaign',
        args: [perClaim, n, expiry, signer, giftMetadataHash(message, template)],
      });
      setTxs((t) => [...t, { label: 'Create gift', hash: h2 }]);
      const receipt = await client.waitForTransactionReceipt({ hash: h2 });
      if (receipt.status !== 'success') throw new Error('Creating the gift failed.');
      const [ev] = parseEventLogs({ abi: escrowAbi, logs: receipt.logs, eventName: 'CampaignCreated' });
      setLink(giftLink(window.location.origin, chain, ev.args.campaignId, pk, message, template));
      try { sessionStorage.removeItem('flatrelay:pendingGift'); } catch {}
      setStep('done');
    } catch (e) {
      setError(friendlyError(e));
      setStep('form');
    }
  }

  if (step === 'done') {
    return (
      <section className="mx-auto max-w-xl pt-12">
        <h1 className="font-wide text-4xl">Your gift is live. Share this link.</h1>
        <p className="mt-3 text-muted">
          Anyone who opens it can claim. Send it privately, in a DM or chat, not in public. The link is the key, and it is not stored anywhere else.
        </p>
        <div className="mt-6 flex gap-2">
          <input readOnly value={link} className="w-full rounded-xl border border-line bg-panel px-4 py-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button
            onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 rounded-xl bg-flat px-4 font-medium text-ink"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <TxList chain={chain} txs={txs} />
      </section>
    );
  }

  const busy = step !== 'form';
  return (
    <section className="mx-auto max-w-xl pt-12">
      <h1 className="font-wide text-4xl">Send a $WIF gift</h1>
      <p className="mt-3 text-muted">Fund it once, share one link. 1% of the gift is burned when you create it.</p>
      {chain === 46630 && <p className="mt-3 rounded-lg border border-white/40 px-3 py-2 text-sm text-white">Testnet: uses mWIF test tokens, not real $WIF.</p>}

      <div className="mt-8 space-y-5">
        <Field label={`${tokenLabel} per claim`}>
          <input inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} disabled={busy} className="input" />
        </Field>
        <Field label="How many people can claim">
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} disabled={busy} className="input" />
        </Field>
        <Field label="Expires after" group>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button key={d} type="button" disabled={busy} onClick={() => setDays(d)}
                className={`rounded-full border px-4 py-1.5 text-sm ${days === d ? 'border-flat text-flat' : 'border-line text-muted'}`}>
                {d} day{d > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Challenge before they can claim" group>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(TEMPLATES) as Template[]).map((t) => (
              <button key={t} type="button" disabled={busy} onClick={() => setTemplate(t)}
                className={`rounded-xl border p-3 text-left ${template === t ? 'border-flat' : 'border-line'}`}>
                <span className={`block font-medium ${template === t ? 'text-flat' : 'text-white'}`}>{TEMPLATES[t].name}</span>
                <span className="mt-1 block text-xs text-muted">{TEMPLATES[t].blurb}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Message (optional, travels in the link only)">
          <input maxLength={140} value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} placeholder="gm, the world is flat" className="input" />
        </Field>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-5 font-mono text-sm">
        {'err' in calc ? (
          <p className="text-red-300">{calc.err}</p>
        ) : (
          <>
            <Row k="Gift pool" v={`${fmt(calc.pool)} ${tokenLabel}`} />
            <Row k="Burned (1%)" v={`${fmt(calc.burn)} ${tokenLabel}`} />
            <Row k="You pay" v={`${fmt(calc.total)} ${tokenLabel}`} strong />
            <p className="mt-3 font-display text-xs text-muted">Unclaimed $WIF comes back to you after expiry. The burned 1% does not.</p>
          </>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-500/40 p-3 text-sm text-red-300">{error}</p>}

      <button onClick={create} disabled={!isConnected || busy || 'err' in calc}
        className="mt-6 w-full rounded-full bg-flat py-3.5 font-medium text-ink disabled:opacity-40">
        {!isConnected ? 'Connect a wallet first' : step === 'approving' ? 'Approve in your wallet…' : step === 'creating' ? 'Confirm the gift in your wallet…' : 'Create gift'}
      </button>
      <TxList chain={chain} txs={txs} />
    </section>
  );
}

/** `group` = a set of buttons: use a div, because a <label> would forward clicks to the first button. */
function Field({ label, children, group }: { label: string; children: React.ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="mb-2 block text-sm text-muted">{label}</span>
      {children}
    </>
  );
  return group ? <div role="group" aria-label={label}>{inner}</div> : <label className="block">{inner}</label>;
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? 'mt-1 border-t border-line pt-2 text-white' : 'text-muted'}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function TxList({ chain, txs }: { chain: SupportedChainId; txs: { label: string; hash: Hex }[] }) {
  if (!txs.length) return null;
  return (
    <ul className="mt-6 space-y-1 font-mono text-xs text-muted">
      {txs.map((t) => (
        <li key={t.hash}>
          {t.label}:{' '}
          <a className="hover:text-flat" href={explorerTx(chain, t.hash)} target="_blank" rel="noreferrer">
            {t.hash.slice(0, 10)}…{t.hash.slice(-6)} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
