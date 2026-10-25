'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from '@wagmi/core'; // not 'wagmi/connectors': that barrel pulls every connector's optional deps
import { robinhood, robinhoodTestnet } from '@/lib/chains';
import { WC_PROJECT_ID, walletConnect } from '@/lib/walletconnect';

export const wagmiConfig = createConfig({
  chains: [robinhood, robinhoodTestnet],
  connectors: [
    injected(), // MetaMask, Rabby, Coinbase extension, wallet in-app browsers
    ...(WC_PROJECT_ID
      ? [walletConnect({
          projectId: WC_PROJECT_ID,
          showQrModal: true,
          metadata: {
            name: 'FLAT//RELAY',
            description: 'Send $WIF as something to play.',
            url: 'https://flat-relay.vercel.app',
            icons: ['https://flat-relay.vercel.app/icon'],
          },
        })]
      : []),
  ],
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
