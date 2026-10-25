// WalletConnect connector, imported from its own file rather than the '@wagmi/connectors' barrel.
// The barrel also loads Base/CDP/Porto connectors whose optional deps we don't ship (that broke the
// build before). This file only needs @wagmi/core, viem and, lazily, @walletconnect/ethereum-provider.
// @ts-ignore: deep import by path; its types are imported separately below.
import { walletConnect as wc } from '../node_modules/@wagmi/connectors/dist/esm/walletConnect.js';
import type { walletConnect as WalletConnectFn } from '../node_modules/@wagmi/connectors/dist/types/walletConnect';

export const walletConnect = wc as typeof WalletConnectFn;

/** Free project ID from dashboard.reown.com. Without it, only browser wallets are offered. */
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';
