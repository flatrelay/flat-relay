export const escrowAbi = [
  { type: 'function', name: 'wif', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'fundingRequired', stateMutability: 'pure', inputs: [{ name: 'perClaim', type: 'uint256' }, { name: 'maxClaims', type: 'uint256' }], outputs: [{ name: 'pool', type: 'uint256' }, { name: 'burn', type: 'uint256' }] },
  { type: 'function', name: 'createCampaign', stateMutability: 'nonpayable', inputs: [{ name: 'perClaim', type: 'uint128' }, { name: 'maxClaims', type: 'uint32' }, { name: 'expiry', type: 'uint64' }, { name: 'claimSigner', type: 'address' }, { name: 'metadataHash', type: 'bytes32' }], outputs: [{ name: 'campaignId', type: 'uint256' }] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'campaignId', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [{ name: 'campaignId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'claimed', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'event', name: 'CampaignCreated', inputs: [{ name: 'campaignId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'claimSigner', type: 'address', indexed: true }, { name: 'perClaim', type: 'uint256', indexed: false }, { name: 'maxClaims', type: 'uint256', indexed: false }, { name: 'expiry', type: 'uint256', indexed: false }, { name: 'metadataHash', type: 'bytes32', indexed: false }, { name: 'burned', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Claimed', inputs: [{ name: 'campaignId', type: 'uint256', indexed: true }, { name: 'recipient', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'submitter', type: 'address', indexed: false }] },
  { type: 'event', name: 'Refunded', inputs: [{ name: 'campaignId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;
