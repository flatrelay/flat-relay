# Architecture

Diagram and rationale: blueprint section 7, https://claude.ai/artifact/JhkKAYpHrtWbASCNFa5UxS

## Contract: `RelayEscrow`
| Function | Who | Effect |
|---|---|---|
| `fundingRequired(perClaim, maxClaims)` | view | `pool = perClaim × maxClaims`, `burn = pool / 100` |
| `createCampaign(perClaim, maxClaims, expiry, claimSigner, metadataHash)` | creator | pulls `pool + burn`, burns `burn`, stores campaign |
| `claim(campaignId, recipient, deadline, signature)` | anyone | pays `perClaim` to `recipient` if ticket signed by `claimSigner` |
| `refund(campaignId)` | creator, after expiry | returns `remaining` |
| `hashTicket(...)` | view | EIP-712 digest for signing |

Events: `CampaignCreated`, `Claimed`, `Refunded`. The proof page and relay map read only these.

## Offchain (from 26 Oct)
- `/api/ticket`: replay-verify game inputs, Turnstile, rate limit (Upstash), sign ticket with verifier key.
- `/api/relay`: submit valid tickets, daily ETH cap.
- Next.js app on Vercel; metadata (title, template, message) stored offchain, committed as `metadataHash`.

## Gas (EVM execution, excl. base + calldata)
createCampaign ≈ 160k · claim ≈ 71k
