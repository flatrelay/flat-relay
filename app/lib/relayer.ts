// Server-side only: imported solely by app/api/relay/route.ts. RELAYER_PRIVATE_KEY has no NEXT_PUBLIC_ prefix,
// so Next.js never bundles it into browser code.
import { createWalletClient, http, isAddress, isHex, parseEther, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhood, robinhoodTestnet, type SupportedChainId } from './chains';
import { DEPLOYMENTS, escrowAbi, publicClient } from './relay';
import { friendlyError, isSupportedChain } from './gift';

/**
 * Gas-free claims. A hot relayer key (RELAYER_PRIVATE_KEY, server-only env var, small ETH balance)
 * submits claim transactions. It cannot redirect funds: the ticket fixes the recipient.
 * Guards: ticket simulated first, minimum reward per claim, per-IP / per-recipient / daily caps,
 * minimum balance floor. Limits are per server instance (in memory); good enough for the hackathon.
 */

const MIN_REWARD = parseUnits(process.env.RELAYER_MIN_REWARD_WIF ?? '1', 18); // dust gifts can't drain the relayer
const MIN_BALANCE = parseEther(process.env.RELAYER_MIN_BALANCE_ETH ?? '0.0002');
const DAILY_CAP = Number(process.env.RELAYER_DAILY_CAP ?? '300');
const IP_LIMIT = { max: 6, windowMs: 10 * 60_000 };
const RECIPIENT_LIMIT = { max: 3, windowMs: 60 * 60_000 };
const MAX_DEADLINE_AHEAD = 60 * 60; // seconds

const hits = new Map<string, number[]>();
let day = '';
let dayCount = 0;
let sendQueue: Promise<unknown> = Promise.resolve(); // one tx at a time per instance (nonce safety)

function limited(key: string, { max, windowMs }: { max: number; windowMs: number }) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) return true;
  list.push(now);
  hits.set(key, list);
  return false;
}

function relayerAccount() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  return privateKeyToAccount(pk as Hex);
}

export async function relayerStatus() {
  const account = relayerAccount();
  if (!account) return { enabled: false as const };
  const chains = await Promise.all(
    ([4663, 46630] as SupportedChainId[]).map(async (id) => {
      const balance = await publicClient(id).getBalance({ address: account.address }).catch(() => 0n);
      return { chainId: id, enabled: balance >= MIN_BALANCE };
    }),
  );
  return { enabled: true as const, address: account.address, minRewardWif: Number(MIN_REWARD / 10n ** 18n), chains };
}

export type RelayRequest = { chainId: number; campaignId: string; recipient: string; deadline: string; signature: string };

export async function relayClaim(body: RelayRequest, ip: string): Promise<{ ok: true; hash: Hex } | { ok: false; status: number; error: string }> {
  const account = relayerAccount();
  if (!account) return { ok: false, status: 503, error: 'Gas-free claims are not enabled on this server.' };

  // 1. shape
  if (!isSupportedChain(body.chainId)) return { ok: false, status: 400, error: 'Unsupported chain.' };
  if (!/^\d{1,30}$/.test(body.campaignId ?? '') || !/^\d{1,20}$/.test(body.deadline ?? '')) return { ok: false, status: 400, error: 'Bad request.' };
  if (!isAddress(body.recipient ?? '')) return { ok: false, status: 400, error: 'Invalid recipient address.' };
  if (!isHex(body.signature) || body.signature.length !== 132) return { ok: false, status: 400, error: 'Invalid signature.' };
  const chainId = body.chainId as SupportedChainId;
  const campaignId = BigInt(body.campaignId);
  const deadline = BigInt(body.deadline);
  const recipient = body.recipient as Address;
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline < now || deadline > now + BigInt(MAX_DEADLINE_AHEAD)) return { ok: false, status: 400, error: 'Ticket deadline out of range. Try again.' };

  // 2. rate limits
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) return { ok: false, status: 429, error: 'Gas-free claims are at today’s limit. You can still claim with your own wallet.' };
  if (limited(`ip:${ip}`, IP_LIMIT)) return { ok: false, status: 429, error: 'Too many claims from this connection. Wait a few minutes.' };
  if (limited(`to:${chainId}:${recipient.toLowerCase()}`, RECIPIENT_LIMIT)) return { ok: false, status: 429, error: 'Too many attempts for this address. Wait a while.' };

  const client = publicClient(chainId);
  const escrow = DEPLOYMENTS[chainId].escrow;

  // 3. economics: only sponsor real gifts, and only while funded
  const campaign = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getCampaign', args: [campaignId] }).catch(() => null);
  if (!campaign) return { ok: false, status: 502, error: 'Could not read the gift. Try again.' };
  if (campaign.creator === '0x0000000000000000000000000000000000000000') return { ok: false, status: 404, error: "This gift doesn't exist." };
  if (campaign.perClaim < MIN_REWARD) return { ok: false, status: 400, error: 'This gift is too small for gas-free claiming. Claim with your own wallet.' };
  const balance = await client.getBalance({ address: account.address });
  if (balance < MIN_BALANCE) return { ok: false, status: 503, error: 'Gas-free claims are paused (relayer needs top-up). You can claim with your own wallet.' };

  // 4. never pay for a failing tx: simulate from the relayer
  const args = [campaignId, recipient, deadline, body.signature as Hex] as const;
  let gas: bigint;
  try {
    const sim = await client.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: 'claim', args });
    gas = (sim.request.gas ?? (await client.estimateContractGas({ account, address: escrow, abi: escrowAbi, functionName: 'claim', args }))) * 12n / 10n;
  } catch (e) {
    return { ok: false, status: 400, error: friendlyError(e) };
  }
  if (gas > 300_000n) gas = 300_000n;

  // 5. send, one at a time
  const wallet = createWalletClient({ account, chain: chainId === 4663 ? robinhood : robinhoodTestnet, transport: http() });
  const send = sendQueue.then(() => wallet.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim', args, gas }));
  sendQueue = send.catch(() => {});
  try {
    const hash = await send;
    dayCount += 1;
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, status: 502, error: friendlyError(e) };
  }
}
