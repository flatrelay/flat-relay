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

### Relayer rate limits (25 Oct)
Per-IP 6 per 10 min, per-recipient 3 per hour, daily cap (successful sends only). Shared across Vercel instances via Upstash Redis when `UPSTASH_REDIS_REST_URL/TOKEN` are set; a Redis lock serialises relayer sends. If Redis fails, limits degrade to per-instance memory rather than switching off. The Upstash token is server-only (no `NEXT_PUBLIC_`).

### Dependency audit (25 Oct 18:55 SGT)
npm's registry isn't reachable from the dev sandboxes, so the exact `app/package-lock.json` (495 packages) was checked against the OSV database (api.osv.dev, which includes all GitHub npm advisories). 9 packages flagged.

| Package | Where it runs | Issue | Exposure in FLAT//RELAY | Action |
|---|---|---|---|---|
| next 14.2.35 | server + client | 25 advisories; 3 critical (image-optimizer RCE via SVG/AVIF; RCE on Windows hosts), several RSC/Server Action DoS, rewrite/middleware SSRF. **No patched 14.x release**; fixes are in 15.5.28 / 16.x | No `next/image`, no Server Actions, no middleware, no rewrites, no custom server, Linux hosting. Image optimizer endpoint still exists by default; RSC DoS applies to any App Router app | **Done:** `images.unoptimized` (removes `/_next/image`), `poweredByHeader:false`. **Done 25 Oct 19:15:** upgraded to next 15.5.28 + React 19.3.1 (build clean) |
| postcss 8.4.31 (inside next) | build only | source-map path traversal / XSS in stringify | Only parses our own CSS at build time | Fixed by the Next 15.5.28 upgrade |
| ws 8.18.0 | server (viem/walletconnect) | memory-exhaustion DoS, uninitialised memory | We only use HTTP transports; no ws server | **Done:** `overrides: ws ^8.21.0` |
| zod 3.22.4 / 3.25.76, uuid 8/9, decode-uri-component 0.2.2 | client (wallet SDKs pulled by wagmi connectors) | DoS / bounds check | Only the injected connector is used; these never see attacker input on our server | Accept; no breaking upgrade before the deadline |
| postcss-selector-parser 6.1.5 | dev (tailwind) | CPU DoS on crafted selectors | Build-time, our own CSS | Accept |

Code-level: `/api/relay` no longer relies on `req.ip` (removed in Next 15); uses Vercel's `x-real-ip` / `x-forwarded-for`.
