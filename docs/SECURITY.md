# Security

## Trust model
- **RelayEscrow** is immutable: no owner, admin, pause or upgrade. The token address is fixed at deploy.
- Funds leave only via `claim` (to the recipient in a valid ticket) or `refund` (creator only, at or after expiry).
- **Gift mode:** the signer is a throwaway key in the link's `#fragment`. Anyone with the link can claim once per address, up to `maxClaims`. Trust = link secrecy.
- **Open mode:** the signer is the FLAT//RELAY verifier. It replays the game, checks Turnstile and rate limits. **It is a central service and not Sybil-proof.** A leaked verifier key could drain open campaigns signed by it, never gift campaigns or refunds.
- **Relayer** only submits tickets; it can't change the recipient. Budget-capped.

## Threats and mitigations
| Threat | Mitigation | Test |
|---|---|---|
| Replay | `claimed[id][recipient]` | replay reverts |
| Redirected ticket / front-run | recipient is in the signed struct | ticket cannot be redirected |
| Cross-campaign/contract/chain | EIP-712 domain + campaignId | 3 tests |
| Signature malleability | OZ `ECDSA.recover` rejects high-s | malleable rejected |
| Pool exhaustion | `claimCount < maxClaims`, `remaining -= perClaim` | exhaustion |
| Bad config | zero signer/amount, 1 ≤ maxClaims ≤ 10,000, expiry ≤ 30 days, pool ≥ 100 wei | 7 cases |
| Fee-on-transfer token | balance delta check on create | (WIF is plain ERC-20) |
| Reentrancy | CEI + `nonReentrant` + `SafeERC20` | n/a |
| Unauthorized withdrawal | only creator, only after expiry | 2 tests |
| Expiry edges | claim `< expiry`, refund `>= expiry` | boundary tests |
| Unlimited approvals | frontend approves exact `pool + burn` | review |

## Relayer (gas-free claims)
- Hot key `RELAYER_PRIVATE_KEY`, server-only env, holds only gas ETH. Never the deployer.
- Can only submit claims; recipient is fixed by the signed ticket. Worst case if leaked: attacker spends its ETH.
- Drain resistance: simulate before send; sponsors only gifts ≥ 1 $WIF per claim (attacker must lock real $WIF per sponsored claim); IP/recipient/daily caps; balance floor.
- Gift key never reaches the server: the browser sends a recipient-bound ticket only.

## Open items
- Run Foundry suite and fuzz on the Mac.
- Independent review (fresh-context agent) before mainnet public use, 1 Nov.
- Verifier and relayer key handling (Vercel env vars), from 26 Oct.
