import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import { robinhood, robinhoodTestnet, type SupportedChainId } from './chains';

/** Deployments. Same address on both chains is a coincidence of deployer nonce 0; always pair with chainId. */
export const DEPLOYMENTS: Record<SupportedChainId, { escrow: Address; token: Address; tokenLabel: string; deployBlock: bigint }> = {
  4663: {
    escrow: '0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426',
    token: '0x5173b8eA6923c2d40267890D45C46a3480954773', // real $WIF
    tokenLabel: '$WIF',
    deployBlock: 96835584n,
  },
  46630: {
    escrow: '0x7fA3034c337C9D6bd9a2bb606F915640b16B7ebe',
    token: '0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426', // MockWIF, TESTNET ONLY
    tokenLabel: 'mWIF',
    deployBlock: 141915589n,
  },
};

export const escrowAbi = parseAbi([
  'function wif() view returns (address)',
  'function BURN_BPS() view returns (uint256)',
  'function campaignCount() view returns (uint256)',
  'function fundingRequired(uint256 perClaim, uint256 maxClaims) pure returns (uint256 pool, uint256 burn)',
  'function createCampaign(uint128 perClaim, uint32 maxClaims, uint64 expiry, address claimSigner, bytes32 metadataHash) returns (uint256 campaignId)',
  'function claim(uint256 campaignId, address recipient, uint256 deadline, bytes signature)',
  'function refund(uint256 campaignId)',
  'function claimed(uint256 campaignId, address recipient) view returns (bool)',
  'function hashTicket(uint256 campaignId, address recipient, uint256 deadline) view returns (bytes32)',
  'function getCampaign(uint256 campaignId) view returns ((address creator, uint64 expiry, uint32 maxClaims, address claimSigner, uint32 claimCount, uint128 perClaim, uint128 remaining, bytes32 metadataHash))',
  'event CampaignCreated(uint256 indexed campaignId, address indexed creator, address indexed claimSigner, uint256 perClaim, uint256 maxClaims, uint256 expiry, bytes32 metadataHash, uint256 burned)',
  'event Claimed(uint256 indexed campaignId, address indexed recipient, uint256 amount, address submitter)',
  'event Refunded(uint256 indexed campaignId, address indexed creator, uint256 amount)',
  'error ZeroAddress()',
  'error InvalidAmount()',
  'error InvalidClaims()',
  'error InvalidExpiry()',
  'error PoolTooSmall()',
  'error UnexpectedTransferAmount()',
  'error UnknownCampaign()',
  'error CampaignExpired()',
  'error CampaignNotExpired()',
  'error TicketExpired()',
  'error AlreadyClaimed()',
  'error CampaignExhausted()',
  'error InvalidSigner()',
  'error NotCreator()',
  'error NothingToRefund()',
  // OpenZeppelin errors that RelayEscrow can bubble up
  'error ECDSAInvalidSignature()',
  'error ECDSAInvalidSignatureLength(uint256 length)',
  'error ECDSAInvalidSignatureS(bytes32 s)',
  'error ReentrancyGuardReentrantCall()',
  'error SafeERC20FailedOperation(address token)',
]);

export const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/** EIP-712 types; must match RelayEscrow (domain "FlatRelay" v1). */
export const ticketTypes = {
  Ticket: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export function ticketDomain(chainId: SupportedChainId) {
  return { name: 'FlatRelay', version: '1', chainId, verifyingContract: DEPLOYMENTS[chainId].escrow } as const;
}

export function publicClient(chainId: SupportedChainId) {
  return createPublicClient({ chain: chainId === 4663 ? robinhood : robinhoodTestnet, transport: http() });
}

export type ActivityItem =
  | { kind: 'funded'; campaignId: bigint; actor: Address; amount: bigint; burned: bigint; maxClaims: bigint; tx: Hex; block: bigint }
  | { kind: 'claimed'; campaignId: bigint; actor: Address; amount: bigint; tx: Hex; block: bigint }
  | { kind: 'refunded'; campaignId: bigint; actor: Address; amount: bigint; tx: Hex; block: bigint };

/**
 * Robinhood Chain RPCs reject eth_getLogs spanning more than 100,000 blocks, and the chain makes
 * several blocks per second. So we scan in 100k-block chunks, a few in parallel, and keep a
 * per-process cache of what has been scanned so later requests only read new blocks.
 */
const CHUNK = 99_999n;
const PARALLEL = 6;
function getChunk(chainId: SupportedChainId, fromBlock: bigint, toBlock: bigint) {
  return publicClient(chainId).getContractEvents({ address: DEPLOYMENTS[chainId].escrow, abi: escrowAbi, fromBlock, toBlock });
}
type RawLog = Awaited<ReturnType<typeof getChunk>>[number];
const scanCache = new Map<SupportedChainId, { scannedTo: bigint; logs: RawLog[] }>();

async function scanEvents(chainId: SupportedChainId): Promise<RawLog[]> {
  const { deployBlock } = DEPLOYMENTS[chainId];
  const head = await publicClient(chainId).getBlockNumber();
  const cached = scanCache.get(chainId) ?? { scannedTo: deployBlock - 1n, logs: [] };
  const ranges: [bigint, bigint][] = [];
  for (let s = cached.scannedTo + 1n; s <= head; s += CHUNK + 1n) ranges.push([s, s + CHUNK > head ? head : s + CHUNK]);
  const fresh: RawLog[] = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const parts = await Promise.all(
      ranges.slice(i, i + PARALLEL).map(([fromBlock, toBlock]) => getChunk(chainId, fromBlock, toBlock)),
    );
    parts.forEach((p) => fresh.push(...p));
  }
  const next = { scannedTo: head, logs: [...cached.logs, ...fresh] };
  scanCache.set(chainId, next);
  return next.logs;
}

/** Block timestamps (unix seconds), cached per process. Blocks never change once final. */
const timeCache = new Map<string, number>();
export async function blockTimes(chainId: SupportedChainId, blocks: bigint[]): Promise<Map<bigint, number>> {
  const client = publicClient(chainId);
  const todo = Array.from(new Set(blocks.filter((b) => !timeCache.has(`${chainId}:${b}`))));
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (b) => {
      const blk = await client.getBlock({ blockNumber: b }).catch(() => null);
      if (blk) timeCache.set(`${chainId}:${b}`, Number(blk.timestamp));
    }));
  }
  const out = new Map<bigint, number>();
  for (const b of blocks) { const t = timeCache.get(`${chainId}:${b}`); if (t) out.set(b, t); }
  return out;
}

/** JSON-safe form of an activity item (bigints as strings), for /api/activity. */
export type ActivityJSON = { kind: ActivityItem['kind']; campaignId: string; actor: Address; amount: string; burned?: string; tx: Hex; block: string; time?: number };
export function toJSON(i: ActivityItem, time?: number): ActivityJSON {
  return { kind: i.kind, campaignId: i.campaignId.toString(), actor: i.actor, amount: i.amount.toString(), burned: i.kind === 'funded' ? i.burned.toString() : undefined, tx: i.tx, block: i.block.toString(), time };
}
export function fromJSON(j: ActivityJSON): ActivityItem {
  const base = { campaignId: BigInt(j.campaignId), actor: j.actor, amount: BigInt(j.amount), tx: j.tx, block: BigInt(j.block) };
  return j.kind === 'funded' ? { kind: 'funded', ...base, burned: BigInt(j.burned ?? '0'), maxClaims: 0n } : { kind: j.kind, ...base };
}

/**
 * Our own wallets (deployer/creator, and the team's second wallet used to test claims).
 * Activity between them is testing, not adoption, and the Proof page labels it that way.
 */
export const TEAM_WALLETS = new Set(['0xbd1abd235bfb3b27491584e07c9b4bfca4aa1562', '0xe298c55a7fe5205c170ba640ee7f659966bf8051']);
export const isTeam = (a: string) => TEAM_WALLETS.has(a.toLowerCase());

/** Reads every RelayEscrow event straight from the chain. No database. */
export async function fetchActivity(chainId: SupportedChainId): Promise<ActivityItem[]> {
  const logs = await scanEvents(chainId);
  const items: ActivityItem[] = [];
  for (const l of logs) {
    const base = { tx: l.transactionHash as Hex, block: l.blockNumber as bigint };
    if (l.eventName === 'CampaignCreated') {
      const a = l.args;
      items.push({ kind: 'funded', campaignId: a.campaignId!, actor: a.creator!, amount: a.perClaim! * a.maxClaims!, burned: a.burned!, maxClaims: a.maxClaims!, ...base });
    } else if (l.eventName === 'Claimed') {
      items.push({ kind: 'claimed', campaignId: l.args.campaignId!, actor: l.args.recipient!, amount: l.args.amount!, ...base });
    } else if (l.eventName === 'Refunded') {
      items.push({ kind: 'refunded', campaignId: l.args.campaignId!, actor: l.args.creator!, amount: l.args.amount!, ...base });
    }
  }
  return items.sort((a, b) => Number(b.block - a.block));
}
