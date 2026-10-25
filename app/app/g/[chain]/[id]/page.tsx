'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatUnits, isAddress, type Address, type Hex } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { explorerTx, type SupportedChainId } from '@/lib/chains';
import { DEPLOYMENTS, escrowAbi, publicClient } from '@/lib/relay';
import { friendlyError, isSupportedChain, parseGiftFragment, signGiftTicket, signerOf, type Template } from '@/lib/gift';
import { seedFor } from '@/lib/games/flatline';
import { FlatLineGame } from '@/components/FlatLineGame';
import { ConnectButton } from '@/components/ConnectButton';
import { LinkRules } from '@/components/LinkRules';

type Campaign = {
  creator: Address; expiry: bigint; maxClaims: number; claimSigner: Address;
  claimCount: number; perClaim: bigint; remaining: bigint;
};
const ZERO = '0x0000000000000000000000000000000000000000';
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 });

/**
 * Prefills /create to split what you just got between two people (49% each, so with the 1% burn
 * it fits inside what you received). Gas-free claiming needs at least 1 per claim, so small gifts
 * suggest one claim of 1 instead.
 */
function passItOnHref(chain: SupportedChainId, id: bigint, perClaim: bigint) {
  const half = Math.floor(Number(formatUnits((perClaim * 49n) / 100n, 18)) * 100) / 100;
  const [per, count] = half >= 1 ? [half, 2] : [1, 1];
  const q = new URLSearchParams({ per: String(per), count: String(count), from: `${chain}-${id}` });
  return `/create?${q}`;
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function GiftPage() {
  const params = useParams<{ chain: string; id: string }>();
  const chainNum = Number(params.chain);
  const chain = (isSupportedChain(chainNum) ? chainNum : null) as SupportedChainId | null;
  const campaignId = /^\d+$/.test(params.id) ? BigInt(params.id) : null;

  const { address, chainId: walletChain, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [frag, setFrag] = useState<{ pk?: Hex; message?: string; template: Template } | null>(null);
  const [won, setWon] = useState<{ misses: number; ms: number } | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [usePaste, setUsePaste] = useState(false);
  const [pasted, setPasted] = useState('');
  const [already, setAlready] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneTx, setDoneTx] = useState<Hex | null>(null);
  const [gasless, setGasless] = useState<{ enabled: boolean; minRewardWif: number } | null>(null);
  const [sponsored, setSponsored] = useState(false);
  const [pendingTx, setPendingTx] = useState<Hex | null>(null);

  useEffect(() => {
    const read = () => { setFrag(parseGiftFragment(window.location.hash)); setOpened(false); setWon(null); setSkipped(false); };
    read();
    window.addEventListener('hashchange', read); // a new link pasted into an open tab
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!chain) return;
    fetch('/api/relay')
      .then((r) => r.json())
      .then((s) => setGasless({ enabled: !!s.enabled && !!s.chains?.find((c: { chainId: number; enabled: boolean }) => c.chainId === chain)?.enabled, minRewardWif: s.minRewardWif ?? 1 }))
      .catch(() => setGasless({ enabled: false, minRewardWif: 1 }));
  }, [chain]);

  useEffect(() => {
    if (!chain || campaignId === null) return;
    publicClient(chain)
      .readContract({ address: DEPLOYMENTS[chain].escrow, abi: escrowAbi, functionName: 'getCampaign', args: [campaignId] })
      .then((c) => setCampaign(c as Campaign))
      .catch((e) => setLoadErr(friendlyError(e)));
  }, [chain, campaignId, doneTx]);

  const pasteMode = usePaste || !isConnected; // no wallet? just paste an address
  const recipient: Address | null = pasteMode ? (isAddress(pasted) ? (pasted as Address) : null) : address ?? null;
  const canGasless = !!gasless?.enabled && !!campaign && campaign.perClaim >= BigInt(gasless.minRewardWif) * 10n ** 18n;

  useEffect(() => {
    setAlready(false);
    if (!chain || campaignId === null || !recipient) return;
    publicClient(chain)
      .readContract({ address: DEPLOYMENTS[chain].escrow, abi: escrowAbi, functionName: 'claimed', args: [campaignId, recipient] })
      .then(setAlready)
      .catch(() => {});
  }, [chain, campaignId, recipient, doneTx]);

  const status = useMemo(() => {
    if (!chain || campaignId === null) return 'badurl';
    if (loadErr) return 'loaderr';
    if (!campaign || !frag) return 'loading';
    if (campaign.creator === ZERO) return 'unknown';
    if (!frag.pk || signerOf(frag.pk) !== campaign.claimSigner) return 'badlink';
    if (BigInt(Math.floor(Date.now() / 1000)) >= campaign.expiry) return 'expired';
    if (campaign.claimCount >= campaign.maxClaims) return 'empty';
    return 'open';
  }, [chain, campaignId, campaign, frag, loadErr]);

  /** Gas-free: the ticket (not the gift key) goes to our relayer, which pays gas. Funds still go only to `recipient`. */
  async function claimGasless() {
    if (!chain || campaignId === null || !frag?.pk || !recipient) return;
    setError(null);
    setClaiming(true);
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const signature = await signGiftTicket(frag.pk, chain, campaignId, recipient, deadline);
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: chain, campaignId: campaignId.toString(), recipient, deadline: deadline.toString(), signature }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Gas-free claim failed.');
      setPendingTx(j.hash as Hex);
      const r = await publicClient(chain).waitForTransactionReceipt({ hash: j.hash as Hex });
      if (r.status !== 'success') throw new Error('The claim transaction failed.');
      setSponsored(true);
      setDoneTx(j.hash as Hex);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setClaiming(false);
      setPendingTx(null);
    }
  }

  async function claim() {
    if (!chain || campaignId === null || !frag?.pk || !recipient || !address) return;
    setError(null);
    setClaiming(true);
    try {
      if (walletChain !== chain) await switchChainAsync({ chainId: chain });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const signature = await signGiftTicket(frag.pk, chain, campaignId, recipient, deadline); // signed locally; the key never leaves this tab
      const client = publicClient(chain);
      const args = [campaignId, recipient, deadline, signature] as const;
      await client.simulateContract({ account: address, address: DEPLOYMENTS[chain].escrow, abi: escrowAbi, functionName: 'claim', args });
      const hash = await writeContractAsync({ chainId: chain, address: DEPLOYMENTS[chain].escrow, abi: escrowAbi, functionName: 'claim', args });
      setPendingTx(hash);
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== 'success') throw new Error('The claim transaction failed.');
      setDoneTx(hash);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setClaiming(false);
      setPendingTx(null);
    }
  }

  const label = chain ? DEPLOYMENTS[chain].tokenLabel : '$WIF';

  if (doneTx && chain && campaign) {
    return (
      <Shell>
        <h1 className="font-wide text-5xl">+{fmt(campaign.perClaim)} {label}</h1>
        <p className="mt-3 text-muted">Sent to {short(recipient!)} on Robinhood Chain{sponsored ? ', gas paid by FLAT//RELAY' : ''}.</p>
        <a href={explorerTx(chain, doneTx)} target="_blank" rel="noreferrer" className="mt-4 inline-block font-mono text-sm text-muted hover:text-flat">
          View transaction ↗
        </a>
        <Link href={passItOnHref(chain, campaignId!, campaign.perClaim)} className="mt-10 block rounded-full bg-flat py-3.5 text-center font-medium text-ink">
          Pass it on: send a gift
        </Link>
        <p className="mt-3 text-center text-sm text-muted">
          Sending a gift needs a browser wallet (or WalletConnect) holding the $WIF, plus a little ETH on Robinhood Chain for
          two network fees. Every hand-off shows up on the <Link href="/proof#map" className="underline">relay map</Link>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {chain === 46630 && <p className="mb-4 rounded-lg border border-white/40 px-3 py-2 text-sm text-white">Testnet gift: mWIF test tokens, no real value.</p>}

      {status === 'loading' && <p className="text-muted">Opening gift…</p>}
      {status === 'badurl' && <Notice title="This link is broken" body="The gift address in the link isn't valid." />}
      {status === 'loaderr' && <Notice title="Couldn't reach Robinhood Chain" body={loadErr ?? ''} />}
      {status === 'unknown' && <Notice title="Gift not found" body="There is no gift with this number." />}
      {status === 'badlink' && <Notice title="This link is incomplete" body="The secret part after # is missing or wrong. Ask the sender to copy the whole link again." />}
      {status === 'expired' && <Notice title="This gift has expired" body="The creator can now reclaim the unclaimed $WIF." />}
      {status === 'empty' && <Notice title="All gone" body="Every claim on this gift has been used." />}

      {status === 'open' && campaign && (
        <>
          <p className="text-lg text-muted">Someone sent you a $WIF gift.</p>
          {frag?.message && <blockquote className="mt-4 border-l-2 border-flat pl-4 text-xl">“{frag.message}”</blockquote>}

          {!opened ? (
            <>
              <button onClick={() => setOpened(true)} className="mt-10 w-full rounded-3xl border border-white/45 bg-panel py-16 text-2xl font-semibold hover:border-flat">
                {frag?.template === 'flatline' ? 'Play to open it' : 'Open it'}
              </button>
              {frag?.template === 'flatline' && (
                <button type="button" onClick={() => { setOpened(true); setSkipped(true); }} className="mt-3 min-h-11 w-full text-center text-sm text-muted underline hover:text-white">
                  Open without playing
                </button>
              )}
            </>
          ) : frag?.template === 'flatline' && !won && !skipped && chain && campaignId !== null ? (
            <>
              <FlatLineGame seed={seedFor(chain, campaignId)} onWin={({ misses, ms }) => setWon({ misses, ms })} />
              <button type="button" onClick={() => setSkipped(true)} className="mt-2 min-h-11 w-full text-center text-sm text-muted underline hover:text-white">
                Can’t play right now? Skip the game
              </button>
            </>
          ) : (
            <>
              {won && (
                <p className="mt-6 font-mono text-xs text-flat">
                  Unlocked in {(won.ms / 1000).toFixed(1)}s{won.misses ? ` with ${won.misses} miss${won.misses > 1 ? 'es' : ''}` : ', no misses'}
                </p>
              )}
              <h1 className="font-wide mt-6 text-6xl">{fmt(campaign.perClaim)} {label}</h1>
              <p className="mt-2 text-sm text-muted">
                {campaign.maxClaims - campaign.claimCount} of {campaign.maxClaims} claims left, first come, first served. Expires {new Date(Number(campaign.expiry) * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
              </p>

              <div className="mt-8 space-y-3">
                {isConnected && (
                  <div className="flex gap-2 text-sm" role="group" aria-label="Where to send the $WIF">
                    <button type="button" aria-pressed={!usePaste} onClick={() => setUsePaste(false)} className={`min-h-11 rounded-full border px-4 py-2 ${!usePaste ? 'border-flat bg-flat/10 text-flat' : 'border-white/45 text-muted'}`}>My connected wallet</button>
                    <button type="button" aria-pressed={usePaste} onClick={() => setUsePaste(true)} className={`min-h-11 rounded-full border px-4 py-2 ${usePaste ? 'border-flat bg-flat/10 text-flat' : 'border-white/45 text-muted'}`}>Another address</button>
                  </div>
                )}
                {pasteMode && (
                  <label className="block">
                    <span className="mb-2 block text-sm text-muted">Your Robinhood Chain address</span>
                    <input className="input font-mono text-sm" placeholder="0x…" value={pasted} onChange={(e) => setPasted(e.target.value.trim())}
                      autoComplete="off" spellCheck={false} aria-invalid={(!!pasted && !recipient) || undefined}
                      aria-describedby={`addr-help${pasted && !recipient ? ' addr-err' : ''}`} />
                    <span id="addr-help" className="mt-2 block text-sm text-muted">
                      A 0x address you control in an Ethereum-style wallet (MetaMask, Rabby, Coinbase Wallet…). Don’t use an exchange
                      deposit address unless that exchange supports Robinhood Chain.
                    </span>
                  </label>
                )}
                {pasteMode && pasted && !recipient && <p id="addr-err" role="alert" className="text-sm text-alert">That doesn’t look like a valid 0x address (42 characters).</p>}
                {recipient && <p className="break-all font-mono text-xs text-muted">Sending to {recipient}</p>}
                {already && <p className="text-sm text-alert">This address has already claimed this gift.</p>}
              </div>

              {error && <p role="alert" className="mt-4 rounded-xl border border-alert/60 p-3 text-sm text-white">{error}</p>}
              {pendingTx && chain && (
                <p role="status" className="mt-4 text-sm text-white">
                  Sent. Waiting for Robinhood Chain to confirm…{' '}
                  <a className="underline" href={explorerTx(chain, pendingTx)} target="_blank" rel="noreferrer">View transaction<span className="sr-only"> (opens Blockscout)</span></a>
                </p>
              )}

              {gasless === null ? (
                <button disabled className="mt-6 w-full rounded-full bg-flat py-3.5 font-medium text-ink opacity-40">Checking gas-free claiming…</button>
              ) : canGasless ? (
                <>
                  <button onClick={claimGasless} disabled={!recipient || already || claiming}
                    className="mt-6 w-full rounded-full bg-flat py-3.5 font-medium text-ink disabled:opacity-40">
                    {claiming ? 'Claiming…' : `Claim ${fmt(campaign.perClaim)} ${label}, gas-free`}
                  </button>
                  <p className="mt-3 text-center text-sm text-muted">No ETH or wallet app needed. FLAT//RELAY pays the network fee; the $WIF goes only to the address above.</p>
                  {isConnected && !usePaste && (
                    <button onClick={claim} disabled={!recipient || already || claiming} className="mt-2 min-h-11 w-full text-center text-sm text-muted underline hover:text-white disabled:opacity-40">
                      Or claim with my wallet and pay gas myself
                    </button>
                  )}
                </>
              ) : (
                <>
                  {!isConnected ? (
                    <div className="mt-6"><ConnectButton variant="block" /></div>
                  ) : (
                    <button onClick={claim} disabled={!recipient || already || claiming}
                      className="mt-6 min-h-11 w-full rounded-full bg-flat py-3.5 font-medium text-ink disabled:opacity-40">
                      {claiming ? 'Confirm in your wallet…' : `Claim ${fmt(campaign.perClaim)} ${label}`}
                    </button>
                  )}
                  <p className="mt-3 text-center text-sm text-muted">
                    {gasless?.enabled && campaign.perClaim < BigInt(gasless.minRewardWif) * 10n ** 18n
                      ? `Gas-free claiming covers gifts of ${gasless.minRewardWif}+ ${label} per claim. This one needs a little ETH for gas.`
                      : 'Gas-free claiming is unavailable right now, so this needs a little ETH on Robinhood Chain for gas.'}
                  </p>
                </>
              )}
            </>
          )}
          <details className="mt-10 border-t border-white/25 pt-4 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 text-muted hover:text-white">How this gift link works</summary>
            <LinkRules />
          </details>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto max-w-md pt-12">{children}</section>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="font-wide text-3xl">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link href="/create" className="mt-8 inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 py-2.5 hover:border-flat">Send your own gift</Link>
    </div>
  );
}
