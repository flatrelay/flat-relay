'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { robinhood } from '@/lib/chains';
import { NO_WALLET_MESSAGE, friendlyError, isSupportedChain } from '@/lib/gift';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Connect with a browser wallet (MetaMask, Rabby, Coinbase extension, wallet in-app browsers) or,
 * when a Reown project ID is configured, WalletConnect (scan a QR with a phone wallet).
 * `header`: compact pill + small menu. `block`: full-width, options shown inline (empty states, forms).
 * With no browser wallet installed it explains the options instead of failing with "Provider not found".
 */
export function ConnectButton({ variant = 'header' }: { variant?: 'header' | 'block' }) {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [hasBrowserWallet, setHasBrowserWallet] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const block = variant === 'block';

  const injected = connectors.find((c) => c.type === 'injected');
  const wc = connectors.find((c) => c.type === 'walletConnect');

  useEffect(() => {
    const check = () => setHasBrowserWallet(!!(window as { ethereum?: unknown }).ethereum);
    check();
    const t = setTimeout(check, 600); // some extensions inject a moment after load
    return () => clearTimeout(t);
  }, []);

  // Close the header menu on Escape or an outside click.
  useEffect(() => {
    if (!open || block) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open, block]);

  async function use(kind: 'injected' | 'walletConnect') {
    setMsg(null);
    const c = kind === 'injected' ? injected : wc;
    if (kind === 'injected' && !hasBrowserWallet) { setMsg(NO_WALLET_MESSAGE + (wc ? ' Or use WalletConnect with a phone wallet.' : '')); return; }
    if (!c) return;
    try {
      await connectAsync({ connector: c });
      setOpen(false);
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  async function switchNet() {
    setMsg(null);
    try {
      await switchChainAsync({ chainId: robinhood.id }); // wagmi asks the wallet to add the network if it doesn't know it
    } catch (e) {
      setMsg(friendlyError(e));
    }
  }

  const note = msg && (
    <p id={`${id}-msg`} role="alert" className="mt-2 whitespace-normal rounded-lg border border-alert/60 bg-deep p-3 text-left text-sm text-white">{msg}</p>
  );

  const options = (
    <div className="space-y-2">
      <button type="button" onClick={() => use('injected')} disabled={isPending}
        className="block min-h-11 w-full rounded-xl border border-white/50 px-4 py-2.5 text-left hover:border-flat disabled:opacity-50">
        <span className="block font-semibold text-white">Browser wallet</span>
        <span className="block text-sm text-muted">{hasBrowserWallet === false ? 'None found in this browser' : 'MetaMask, Rabby, Coinbase or your wallet app’s browser'}</span>
      </button>
      {wc && (
        <button type="button" onClick={() => use('walletConnect')} disabled={isPending}
          className="block min-h-11 w-full rounded-xl border border-white/50 px-4 py-2.5 text-left hover:border-flat disabled:opacity-50">
          <span className="block font-semibold text-white">WalletConnect</span>
          <span className="block text-sm text-muted">Scan a QR code with a phone wallet</span>
        </button>
      )}
      {isPending && <p className="text-sm text-muted" role="status">Check your wallet…</p>}
      {note}
    </div>
  );

  if (!isConnected) {
    if (block) return <div aria-describedby={msg ? `${id}-msg` : undefined}>{options}</div>;
    return (
      <div ref={wrap} className="relative flex flex-col items-end">
        <button type="button" onClick={() => { setOpen((o) => !o); setMsg(null); }} aria-expanded={open} aria-controls={`${id}-menu`}
          className="min-h-11 rounded-full border border-white/50 px-4 py-2 text-sm text-white hover:border-flat">
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {open && (
          <div id={`${id}-menu`} className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] whitespace-normal rounded-2xl border border-white/40 bg-deep p-3 shadow-xl">
            {options}
          </div>
        )}
      </div>
    );
  }

  if (!isSupportedChain(chainId)) {
    return (
      <div className={block ? '' : 'relative flex flex-col items-end'}>
        <button type="button" onClick={switchNet} disabled={switching} aria-describedby={msg ? `${id}-msg` : undefined}
          className={`min-h-11 rounded-full bg-flat px-4 py-2 text-ink disabled:opacity-60 ${block ? 'w-full font-semibold' : 'text-sm'}`}>
          {switching ? 'Check your wallet…' : 'Switch to Robinhood Chain'}
        </button>
        <div className={block ? '' : 'absolute right-0 top-full z-30 w-72 max-w-[calc(100vw-2rem)] whitespace-normal'}>{note}</div>
      </div>
    );
  }

  if (block) return null; // connected and on the right network: the page carries on
  return (
    <button type="button" onClick={() => disconnect()} aria-label={`Connected as ${address}. Disconnect`} title="Disconnect"
      className="flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-4 py-2 font-mono text-sm text-white">
      {chainId === 46630 && <span className="rounded border border-white/50 px-1.5 text-[10px] text-white">TESTNET</span>}
      {short(address!)}
    </button>
  );
}
