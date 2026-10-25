// Server-side only: imported solely by app/api/relay/route.ts. RELAYER_PRIVATE_KEY has no NEXT_PUBLIC_ prefix,
// so Next.js never bundles it into browser code.
import { createWalletClient, http, isAddress, isHex, parseEther, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhood, robinhoodTestnet, type SupportedChainId } from './chains';
import { DEPLOYMENTS, escrowAbi, publicClient } from './relay';
import { friendlyError, isSupportedChain } from './gift';
import { bumpDaily, claimOnce, dailyCount, limiterBackend, overLimit, releaseOnce, withSendLock } from './ratelimit';

/**
 * Gas-free claims. A hot relayer key (RELAYER_PRIVATE_KEY, server-only env var, small ETH balance)
 * submits claim transactions. It cannot redirect funds: the ticket fixes the recipient.
 * Guards: ticket simulated first, minimum reward per claim, per-IP / per-recipient / daily caps,
 * minimum balance floor. Limits and the send lock are shared across instances via Upstash Redis when
 * configured (see lib/ratelimit.ts), otherwise per instance.
 */

const MIN_REWARD = parseUnits(process.env.RELAYER_MIN_REWARD_WIF ?? '1', 18); // dust gifts can't drain the relayer
const MIN_BALANCE = parseEther(process.env.RELAYER_MIN_BALANCE_ETH ?? '0.0002');
const DAILY_CAP = Number(process.env.RELAYER_DAILY_CAP ?? '300');
const IP_LIMIT = { max: 6, windowSec: 10 * 60 };
const RECIPIENT_LIMIT = { max: 3, windowSec: 60 * 60 };
const MAX_DEADLINE_AHEAD = 60 * 60; // seconds


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
  return { enabled: true as const, address: account.address, minRewardWif: Number(MIN_REWARD / 10n ** 18n), limits: limiterBackend(), chains };
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
  if ((await dailyCount()) >= DAILY_CAP) return { ok: false, status: 429, error: 'Gas-free claims are at today’s limit. You can still claim with your own wallet.' };
  if (await overLimit(`ip:${ip}`, IP_LIMIT.max, IP_LIMIT.windowSec)) return { ok: false, status: 429, error: 'Too many claims from this connection. Wait a few minutes.' };
  if (await overLimit(`to:${chainId}:${recipient.toLowerCase()}`, RECIPIENT_LIMIT.max, RECIPIENT_LIMIT.windowSec)) return { ok: false, status: 429, error: 'Too many attempts for this address. Wait a while.' };

  // 2b. the same claim can't be in flight twice (double-clicks, two tabs): a duplicate would revert on chain and waste gas
  const onceKey = `${chainId}:${campaignId}:${recipient.toLowerCase()}`;
  if (!(await claimOnce(onceKey, 120))) return { ok: false, status: 409, error: 'This claim is already being sent. Wait a minute, then refresh the page to check.' };
  const r = await submit(account, chainId, campaignId, recipient, deadline, body.signature as Hex);
  if (!r.ok) await releaseOnce(onceKey); // let them retry after a failure; keep the key after success
  return r;
}

async function submit(
  account: NonNullable<ReturnType<typeof relayerAccount>>, chainId: SupportedChainId, campaignId: bigint,
  recipient: Address, deadline: bigint, signature: Hex,
): Promise<{ ok: true; hash: Hex } | { ok: false; status: number; error: string }> {
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
  const args = [campaignId, recipient, deadline, signature] as const;
  let gas: bigint;
  try {
    const sim = await client.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: 'claim', args });
    gas = (sim.request.gas ?? (await client.estimateContractGas({ account, address: escrow, abi: escrowAbi, functionName: 'claim', args }))) * 12n / 10n;
  } catch (e) {
    return { ok: false, status: 400, error: friendlyError(e) };
  }
  if (gas > 300_000n) gas = 300_000n;

  // 5. send, one at a time across all instances (shared lock), so two sends never race for a nonce
  const wallet = createWalletClient({ account, chain: chainId === 4663 ? robinhood : robinhoodTestnet, transport: http() });
  try {
    const hash = await withSendLock(chainId, async () => {
      // re-check inside the lock: another instance may have just used the last slot
      await client.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: 'claim', args });
      return wallet.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim', args, gas });
    });
    await bumpDaily();
    return { ok: true, hash };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Relayer busy')) return { ok: false, status: 503, error: e.message };
    return { ok: false, status: 400, error: friendlyError(e) };
  }
}
