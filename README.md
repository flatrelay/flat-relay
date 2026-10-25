# FLAT//RELAY

**Send $WIF as something to play, not just a transfer.**

Creators fund a $WIF campaign and share a link. Players open it, play a 20–45 second skill game, and claim $WIF on Robinhood Chain. Each campaign burns 1% of its reward pool.

Built for the [World Is Flat hackathon](https://worldisflat.fun/build).

## How it works
- **RelayEscrow** (Solidity) holds campaign funds. No owner, no admin, no upgrades. Funds leave only through a valid claim or the creator's refund after expiry.
- Every claim is an **EIP-712 ticket** naming one recipient, campaign, contract and chain, with a deadline. Anyone can submit it; the $WIF always goes to the named recipient. One claim per address per campaign.
- **Gift mode:** the link's `#k=` fragment carries a throwaway key that signs tickets. No server involved.
- **Open challenge mode:** a verifier replays the game before signing. This is a trusted service, and it is not Sybil-proof. See `docs/SECURITY.md`.

**Live app:** https://flat-relay.vercel.app · **Repo:** https://github.com/flatrelay/flat-relay

## Status
Phase 1: contracts and tests. See `docs/PROJECT_STATE.md`.

## Quick start
```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std@v1.9.4 --no-git
forge test -vv
```

## Addresses
| Network | RelayEscrow | Token |
|---|---|---|
| Robinhood Chain mainnet (4663) | `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426` ([Sourcify exact match](https://repo.sourcify.dev/4663/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426)) | $WIF `0x5173b8eA6923c2d40267890D45C46a3480954773` |
| Robinhood Chain testnet (46630) | `0x7fA3034c337C9D6bd9a2bb606F915640b16B7ebe` | MockWIF `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426` (test only) |

License: MIT
