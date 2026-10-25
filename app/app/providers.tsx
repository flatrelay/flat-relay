'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from '@wagmi/core'; // not 'wagmi/connectors': that barrel pulls every connector's optional deps
import { robinhood, robinhoodTestnet } from '@/lib/chains';

export const wagmiConfig = createConfig({
  chains: [robinhood, robinhoodTestnet],
  connectors: [injected()], // MetaMask, Rabby, Coinbase extension, mobile in-app browsers
  transports: { [robinhood.id]: http(), [robinhoodTestnet.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
