'use client';

import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { robinhood } from '@/lib/chains';
import { isSupportedChain } from '@/lib/gift';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ConnectButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <div className="flex flex-col items-end">
        <button
          onClick={() => injected && connect({ connector: injected })}
          disabled={!injected || isPending}
          className="rounded-full border border-line px-4 py-1.5 text-white hover:border-flat disabled:opacity-50"
        >
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
        {error && <span className="mt-1 max-w-[16rem] text-right text-xs text-red-400">{error.message.split('\n')[0]}</span>}
      </div>
    );
  }

  if (!isSupportedChain(chainId)) {
    return (
      <button onClick={() => switchChain({ chainId: robinhood.id })} className="rounded-full bg-flat px-4 py-1.5 text-ink">
        Switch to Robinhood Chain
      </button>
    );
  }

  return (
    <button onClick={() => disconnect()} className="flex items-center gap-2 rounded-full border border-line px-4 py-1.5 font-mono text-white" title="Disconnect">
      {chainId === 46630 && <span className="rounded border border-white/50 px-1.5 text-[10px] text-white">TESTNET</span>}
      {short(address!)}
    </button>
  );
}
