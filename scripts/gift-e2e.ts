/**
 * FLAT//RELAY gift-mode end-to-end check.
 *
 * Creates a gift campaign funded by the creator key, signs a claim ticket with a
 * throwaway "gift link" key, submits the claim, and checks the recipient's balance.
 *
 *   cd scripts && npm install
 *   cp .env.example .env   # fill in values; .env is git-ignored
 *   npm run gift:testnet
 *   npm run gift:fork      # local anvil fork of mainnet, real $WIF contract, no real funds
 *   npm run gift:mainnet   # real $WIF. Requires CONFIRM_MAINNET=yes and a small PER_CLAIM.
 */
import 'dotenv/config';
import {
  createPublicClient, createWalletClient, defineChain, http, keccak256, toHex,
  parseUnits, formatUnits, parseEventLog, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { escrowAbi, erc20Abi } from './abi.js';

const NETWORKS = {
  testnet: { id: 46630, rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com' },
  mainnet: { id: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' },
  // Local anvil fork of mainnet: real $WIF contract, fake money, nothing leaves your Mac.
  fork: { id: 4663, rpc: 'http://127.0.0.1:8545', explorer: 'local-fork (not on any explorer)' },
} as const;
const WIF_MAINNET: Address = '0x5173b8eA6923c2d40267890D45C46a3480954773';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const net = (process.argv[2] ?? 'testnet') as keyof typeof NETWORKS;
  const cfg = NETWORKS[net];
  if (!cfg) throw new Error('usage: gift-e2e.ts testnet|mainnet|fork');

  const chain = defineChain({
    id: cfg.id, name: `Robinhood Chain ${net}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [net === 'fork' ? cfg.rpc : (process.env.RH_RPC_URL ?? cfg.rpc)] } },
  });
  const pub = createPublicClient({ chain, transport: http() });
  const creator = privateKeyToAccount(env('PRIVATE_KEY') as Hex);
  const wallet = createWalletClient({ chain, transport: http(), account: creator });

  const escrow = env('ESCROW_ADDRESS') as Address;
  const token = (net === 'testnet' ? env('TOKEN_ADDRESS') : WIF_MAINNET) as Address;
  if (net === 'mainnet' && process.env.CONFIRM_MAINNET !== 'yes') throw new Error('Set CONFIRM_MAINNET=yes to spend real $WIF');

  const chainId = await pub.getChainId();
  if (chainId !== cfg.id) throw new Error(`RPC is on chain ${chainId}, expected ${cfg.id}`);
  const onchainToken = await pub.readContract({ address: escrow, abi: escrowAbi, functionName: 'wif' });
  if (onchainToken.toLowerCase() !== token.toLowerCase()) throw new Error(`Escrow token ${onchainToken} != ${token}`);

  const decimals = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' });
  const symbol = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' });
  const perClaim = parseUnits(env('PER_CLAIM', '10'), decimals);
  const maxClaims = Number(env('MAX_CLAIMS', '1'));
  if (net === 'mainnet' && perClaim * BigInt(maxClaims) > parseUnits('1000', decimals)) throw new Error('Mainnet test capped at 1000 WIF');

  const [pool, burn] = await pub.readContract({ address: escrow, abi: escrowAbi, functionName: 'fundingRequired', args: [perClaim, BigInt(maxClaims)] });
  const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [creator.address] });
  console.log(`creator ${creator.address} holds ${formatUnits(bal, decimals)} ${symbol}`);
  console.log(`campaign: ${maxClaims} x ${formatUnits(perClaim, decimals)} = ${formatUnits(pool, decimals)} pool + ${formatUnits(burn, decimals)} burned`);
  if (bal < pool + burn) throw new Error('Insufficient token balance');

  const link = (h: Hex) => `${cfg.explorer}/tx/${h}`;
  const wait = async (h: Hex, label: string) => {
    const r = await pub.waitForTransactionReceipt({ hash: h });
    if (r.status !== 'success') throw new Error(`${label} reverted: ${link(h)}`);
    console.log(`${label}: ${link(h)} (gas ${r.gasUsed})`);
    return r;
  };

  // 1. exact approval (never unlimited)
  await wait(await wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [escrow, pool + burn] }), 'approve');

  // 2. gift key: in the app this lives only in the link's #fragment
  const giftKey = generatePrivateKey();
  const gift = privateKeyToAccount(giftKey);
  const block = await pub.getBlock();
  const expiry = block.timestamp + 24n * 3600n;
  const metadataHash = keccak256(toHex(JSON.stringify({ template: 'flat-line', note: 'gift-e2e' })));

  const createRcpt = await wait(await wallet.writeContract({
    address: escrow, abi: escrowAbi, functionName: 'createCampaign',
    args: [perClaim, maxClaims, expiry, gift.address, metadataHash],
  }), 'createCampaign');
  const [created] = parseEventLog({ abi: escrowAbi, logs: createRcpt.logs, eventName: 'CampaignCreated' });
  const campaignId = created.args.campaignId;
  console.log(`campaign #${campaignId}, gift signer ${gift.address}`);

  // 3. recipient signs nothing; the gift key signs a ticket naming the recipient
  const recipient = (process.env.RECIPIENT ?? privateKeyToAccount(generatePrivateKey()).address) as Address;
  const deadline = block.timestamp + 3600n;
  const signature = await gift.signTypedData({
    domain: { name: 'FlatRelay', version: '1', chainId: cfg.id, verifyingContract: escrow },
    types: { Ticket: [{ name: 'campaignId', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Ticket',
    message: { campaignId, recipient, deadline },
  });

  // 4. creator submits as "relayer"; funds still go to the recipient
  await wait(await wallet.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim', args: [campaignId, recipient, deadline, signature] }), 'claim');

  const got = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [recipient] });
  if (got < perClaim) throw new Error(`recipient balance ${got} < ${perClaim}`);
  console.log(`PASS: ${recipient} received ${formatUnits(got, decimals)} ${symbol}`);
  console.log(`Record these hashes in docs/TEST_EVIDENCE.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
