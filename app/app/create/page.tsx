'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseEventLogs, parseUnits, type Hex } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { explorerTx, type SupportedChainId } from '@/lib/chains';
import { DEPLOYMENTS, erc20Abi, escrowAbi, publicClient } from '@/lib/relay';
import { ConnectButton } from '@/components/ConnectButton';
import { LinkRules } from '@/components/LinkRules';
import { TEMPLATES, friendlyError, giftLink, giftMetadataHash, isSupportedChain, newGiftKey, type Template } from '@/lib/gift';

type Step = 'form' | 'approving' | 'creating' | 'done';
// Expiry choices in seconds. 1 hour is handy for demos and for testing the refund path.
const EXPIRY = [
  { label: '1 hour', s: 3600 },
  { label: '1 day', s: 86400 },
  { label: '3 days', s: 3 * 86400 },
  { label: '7 days', s: 7 * 86400 },
  { label: '30 days', s: 30 * 86400 - 3600 }, // an hour under the contract's 30-day cap
];
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });

export default function CreatePage() {
  const { address, chainId: walletChain, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const chain: SupportedChainId = isSupportedChain(walletChain) ? walletChain : 4663;
  const { escrow, token, tokenLabel } = DEPLOYMENTS[chain];

  const [per, setPer] = useState('10');
  const [count, setCount] = useState('1');
  const [expirySecs, setExpirySecs] = useState(7 * 86400);
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState<Template>('flatline');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [txs, setTxs] = useState<{ label: string; hash: Hex }[]>([]);
  const [copied, setCopied] = useState(false);
  const [from, setFrom] = useState<string | null>(null);

  // "Pass it on" from a claim page arrives as ?per=&count=&from=<chain>-<id>. Read once on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('per'), c = q.get('count'), f = q.get('from');
    if (p && /^\d+(\.\d+)?$/.test(p)) setPer(p);
    if (c && /^\d+$/.test(c)) setCount(c);
    if (f && /^\d+-\d+$/.test(f)) {
      const id = f.split('-')[1];
      setFrom(id);
      setMessage((m) => m || `Passed on from gift #${id}`);
    }
  }, []);

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

  const errField = 'err' in calc ? (calc.err?.startsWith('Claims') ? 'count' : 'per') : null;

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
      const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySecs);
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
          The link is the key, and it isn’t stored anywhere else, so copy it now. Send it privately, in a DM or chat.
        </p>
        <LinkRules />
        <div className="mt-6 flex gap-2">
          <input readOnly value={link} aria-label="Your gift link" className="w-full rounded-xl border border-white/55 bg-panel px-4 py-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
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
      {from && (
        <p className="mt-3 rounded-lg border border-flat/60 px-3 py-2 text-sm text-white">
          Passing on gift #{from}. The amounts are a suggestion based on what you received; change anything you like. Sending
          needs a browser wallet holding that $WIF plus a little ETH on Robinhood Chain for two network fees.
        </p>
      )}
      {chain === 46630 && <p className="mt-3 rounded-lg border border-white/40 px-3 py-2 text-sm text-white">Testnet: uses mWIF test tokens, not real $WIF.</p>}

      <div className="mt-8 space-y-5">
        <Field label={`${tokenLabel} each person gets`}>
          <input inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} disabled={busy} className="input"
            aria-invalid={errField === 'per' || undefined} aria-describedby={errField === 'per' ? 'calc-err' : undefined} />
        </Field>
        <Field label="How many people can claim (one claim per address)">
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} disabled={busy} className="input"
            aria-invalid={errField === 'count' || undefined} aria-describedby={errField === 'count' ? 'calc-err' : undefined} />
        </Field>
        <Field label="Expires after" group>
          <div className="flex flex-wrap gap-2">
            {EXPIRY.map((o) => (
              <button key={o.s} type="button" disabled={busy} onClick={() => setExpirySecs(o.s)} aria-pressed={expirySecs === o.s}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm ${expirySecs === o.s ? 'border-flat bg-flat/10 text-flat' : 'border-white/45 text-muted hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Game before they claim (recipients can always skip it)" group>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(TEMPLATES) as Template[]).map((t) => (
              <button key={t} type="button" disabled={busy} onClick={() => setTemplate(t)} aria-pressed={template === t}
                className={`rounded-xl border p-3 text-left ${template === t ? 'border-flat bg-flat/10' : 'border-white/45'}`}>
                <span className={`block font-medium ${template === t ? 'text-flat' : 'text-white'}`}>{TEMPLATES[t].name}</span>
                <span className="mt-1 block text-sm text-muted">{TEMPLATES[t].blurb}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Message (optional). Anyone with the link can read it; it is never stored on chain">
          <input maxLength={140} value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} placeholder="gm, the world is flat" className="input" />
        </Field>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-5 font-mono text-sm">
        <div aria-live="polite">
        {'err' in calc ? (
          <p id="calc-err" className="text-alert">{calc.err}</p>
        ) : (
          <>
            <Row k="Gift pool (what claimers share)" v={`${fmt(calc.pool)} ${tokenLabel}`} />
            <Row k="Burned: 1% added on top" v={`${fmt(calc.burn)} ${tokenLabel}`} />
            <Row k="You pay in $WIF" v={`${fmt(calc.total)} ${tokenLabel}`} strong />
            <div className="mt-3 space-y-2 font-body text-sm text-muted">
              <p>Plus two small network fees in ETH on Robinhood Chain: one to approve exactly this amount, one to create the gift.</p>
              <p>After it expires, you can reclaim any unclaimed $WIF from My gifts (one more small fee). It doesn’t come back automatically. The burned 1% is gone for good.</p>
            </div>
          </>
        )}
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-alert/60 p-3 text-sm text-white">{error}</p>}

      {!isConnected ? (
        <div className="mt-6">
          <p className="mb-3 text-sm text-muted">Connect the wallet that holds your {tokenLabel} to create the gift.</p>
          <ConnectButton variant="block" />
        </div>
      ) : (
        <button onClick={create} disabled={busy || 'err' in calc}
          className="mt-6 min-h-11 w-full rounded-full bg-flat py-3.5 font-medium text-ink disabled:opacity-40">
          {step === 'approving' ? 'Step 1 of 2: approve in your wallet…' : step === 'creating' ? 'Step 2 of 2: confirm the gift in your wallet…' : 'Create gift'}
        </button>
      )}
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
