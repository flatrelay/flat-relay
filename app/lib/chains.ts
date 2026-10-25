import { defineChain } from 'viem';

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RH_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
});

export const SUPPORTED_CHAINS = [robinhood, robinhoodTestnet] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

export function explorerTx(chainId: SupportedChainId, hash: string) {
  const c = SUPPORTED_CHAINS.find((x) => x.id === chainId)!;
  return `${c.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(chainId: SupportedChainId, address: string) {
  const c = SUPPORTED_CHAINS.find((x) => x.id === chainId)!;
  return `${c.blockExplorers.default.url}/address/${address}`;
}
