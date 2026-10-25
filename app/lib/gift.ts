import { BaseError, ContractFunctionRevertedError, keccak256, toHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { SupportedChainId } from './chains';
import { DEPLOYMENTS, ticketDomain, ticketTypes } from './relay';

/**
 * Gift mode: a throwaway key is generated in the creator's browser. Its address becomes the
 * campaign's claimSigner; the key itself travels only in the link's #fragment, which browsers
 * never send to any server. Whoever holds the link can sign a claim ticket for their own address.
 */

export function newGiftKey(): { pk: Hex; signer: Address } {
  const pk = generatePrivateKey(); // crypto.getRandomValues under the hood
  return { pk, signer: privateKeyToAccount(pk).address };
}

export const TEMPLATES = {
  flatline: { name: 'Flat Line', blurb: 'Land a sliding sun on the horizon, three times. About 20 seconds.' },
  none: { name: 'No game', blurb: 'The gift opens straight away.' },
} as const;
export type Template = keyof typeof TEMPLATES;

export function giftMetadataHash(message: string, template: Template = 'none'): Hex {
  return keccak256(toHex(JSON.stringify({ v: 1, kind: 'gift', message, template })));
}

const b64url = {
  enc: (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  },
};

export function giftLink(origin: string, chainId: SupportedChainId, campaignId: bigint, pk: Hex, message: string, template: Template = 'none') {
  const frag = new URLSearchParams({ k: pk });
  if (message.trim()) frag.set('m', b64url.enc(message.trim()));
  if (template !== 'none') frag.set('t', template);
  return `${origin}/g/${chainId}/${campaignId}#${frag.toString()}`;
}

export function parseGiftFragment(hash: string): { pk?: Hex; message?: string; template: Template } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const k = params.get('k');
  const m = params.get('m');
  const t = params.get('t');
  const template: Template = t && t in TEMPLATES ? (t as Template) : 'none';
  let message: string | undefined;
  try {
    message = m ? b64url.dec(m).slice(0, 280) : undefined;
  } catch {
    message = undefined;
  }
  return { pk: k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : undefined, message, template };
}

export function signerOf(pk: Hex): Address {
  return privateKeyToAccount(pk).address;
}

export function signGiftTicket(pk: Hex, chainId: SupportedChainId, campaignId: bigint, recipient: Address, deadline: bigint) {
  return privateKeyToAccount(pk).signTypedData({
    domain: ticketDomain(chainId),
    types: ticketTypes,
    primaryType: 'Ticket',
    message: { campaignId, recipient, deadline },
  });
}

export function isSupportedChain(id: number | undefined): id is SupportedChainId {
  return id !== undefined && id in DEPLOYMENTS;
}

const REVERT_MESSAGES: Record<string, string> = {
  AlreadyClaimed: 'This address has already claimed this gift.',
  CampaignExhausted: 'This gift has been fully claimed.',
  CampaignExpired: 'This gift has expired. The creator can reclaim the $WIF.',
  TicketExpired: 'The claim ticket expired. Try again.',
  InvalidSigner: "This link doesn't match the gift. Check you copied the whole link.",
  UnknownCampaign: "This gift doesn't exist.",
  InvalidExpiry: 'Expiry must be between now and 30 days.',
  InvalidClaims: 'Number of claims must be between 1 and 10,000.',
  InvalidAmount: 'Reward per claim must be more than zero.',
  PoolTooSmall: 'The total is too small to burn 1%. Increase the amount.',
  NotCreator: 'Only the creator can refund this gift.',
  CampaignNotExpired: "This gift hasn't expired yet.",
  NothingToRefund: 'Nothing left to refund.',
  ECDSAInvalidSignature: "This link's signature is invalid. Check you copied the whole link.",
  ECDSAInvalidSignatureLength: "This link's signature is invalid. Check you copied the whole link.",
  ECDSAInvalidSignatureS: "This link's signature is invalid. Check you copied the whole link.",
  SafeERC20FailedOperation: 'The token transfer failed. Check your balance and approval.',
};

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message.split('\n')[0] : 'Something went wrong.';
}
