# Project state

_Updated 24 Oct 2026, 21:00 SGT_

## Done
- Blueprint approved. Decision: **1% burn** of the reward pool at campaign creation.
- `RelayEscrow.sol` and `MockWIF.sol` written. Compile clean (solc 0.8.28, 0 warnings).
- Foundry suite `test/RelayEscrow.t.sol` (18 tests incl. 2 fuzz) written and type-checked. **Not yet run under forge** (see blocker).
- Same scenarios executed in an in-browser EVM against the compiled bytecode: 19/19 pass. See `TEST_EVIDENCE.md`.
- `scripts/gift-e2e.ts` written (not yet run).

## Blockers
- Claude's workspace and the computer's Linux shell have no package network, so `forge` couldn't be installed. Run `forge test` on the Mac (commands in `CLAUDE.md`).

## Wallet
- Relayer (gas-free claims): `0x0F3c330bFbC8F21951dAd6cf2e82aF96fdbEa994`, key in `app/.env.local` only. Testnet: 0.005 ETH (25 Oct 14:35). Mainnet: 0.002 ETH (25 Oct 16:13) → gas-free enabled on mainnet. Deployer mainnet ETH ≈ 0.001 (top up before more mainnet ops).
- Deployer (cast keystore `deployer`): `0xBD1abD235BfB3B27491584e07C9b4bfCa4AA1562`, 0.1 testnet ETH confirmed 24 Oct 21:30 SGT.
- `script/GiftE2E.s.sol` replaces the TS script for e2e: signs with the keystore, no key in files.

## Phase 1 status: COMPLETE (25 Oct 00:05 SGT)
- forge 18/18; testnet deploy + gift e2e; **mainnet RelayEscrow `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426`**, Sourcify exact match, real $WIF gift e2e PASS (0.1 $WIF burned). See TEST_EVIDENCE.
- Deployer left: ~0.00302 ETH, ~1,553.68 $WIF.

## Open items
- Blockscout still shows unverified (Cloudflare blocks forge API; web form didn't register). Recheck; Sourcify link is the fallback proof.
- Refund path not yet exercised on chain (unit + fuzz tested). Optional: 2-claim campaign, claim 1, refund after expiry.

## Phase 2 progress
- 25 Oct 00:20: `app/` scaffolded (Next 14.2.15, React 18.3, wagmi 2 + viem 2.21.45, Tailwind). `lib/relay.ts` has deployments, ABI (incl. custom errors), EIP-712 domain, `fetchActivity()`. `/proof` reads events from chain (decode verified against mainnet in browser). Landing stub. **Runs locally (25 Oct 00:40): /proof shows 1 campaign, 1 claim, 10 $WIF claimed, 0.1 burned, read live from mainnet.** Fixes: next ^14.2.35 (CVE-2025-55184/67779), viem ^2 (now 2.57.11, wagmi 2.19.5 needs it), `injected` imported from `@wagmi/core` (the `wagmi/connectors` barrel pulls Base/CDP optional deps and breaks the build).
- Note: public RPC getLogs over full range works now (~54k blocks); chain does ~10 blocks/s, so chunk or use Blockscout API before ~2 Nov.

- 25 Oct 00:50: **gift flow built**: `lib/gift.ts` (key gen, link `#k=`/`&m=`, fragment parse, ticket signing, friendly revert messages), `/create` (balance check → exact approve → createCampaign → share link), `/g/[chain]/[id]` (reads campaign, validates link key = claimSigner, open reveal, claim to connected or pasted address). tsc clean.
  Tested: testnet gift #2 (10×10 mWIF, signer 0x029E…6D4A, created via cast). Page validated link + decoded message; page-identical ticket simulates OK on testnet, redirected ticket → InvalidSigner. Wrong key on mainnet #1 → "link incomplete".
  25 Oct 14:15: **user click-through on testnet PASS** (claim #2 via link; create #3 via /create + claim). 
- 25 Oct 14:25: **RPC getLogs limit = 100,000 blocks** (testnet error confirmed); mainnet already 540k blocks past deploy, so `/proof` single query would fail. `fetchActivity` now scans in 100k chunks, 6 parallel, with per-process incremental cache. tsc clean. Needs re-check of /proof. Long-term: Blockscout/Alchemy indexer if scan gets slow (mainnet ~10 blocks/s → ~12M blocks by 6 Nov ≈ 120 chunks on a cold start).

- 25 Oct 14:40: **gas-free claims built**: `lib/relayer.ts` + `app/api/relay/route.ts` (GET status, POST claim). Guards: shape checks, deadline ≤ 1h, min reward 1 $WIF/claim (anti dust-drain), per-IP 6/10min, per-recipient 3/h, daily cap 300, balance floor 0.0002 ETH, simulate-before-send, gas cap 300k, serialized sends. Claim page: gas-free button (paste address, no wallet needed) + optional self-paid fallback. tsc clean; GET without key → `{enabled:false}`. Limits are in-memory per instance (move to Upstash before launch).
  Relayer key set in `app/.env.local`, 0.005 testnet ETH funded. **Gas-free claim PASS on testnet (25 Oct 14:45)**, relayer paid gas, recipient had no wallet. Bad-request matrix rejected with no gas spent.

- 25 Oct 15:10: **Flat Line game built**: `lib/games/flatline.ts` (pure, seeded by chain+campaign, `verifyRun` replay for future open mode), `components/FlatLineGame.tsx` (rAF animation, tap/Space/Enter, live round counter). Template chosen on /create (default Flat Line), carried in link `&t=flatline` and in metadataHash. Claim page: "Play to open it" → game → reveal + claim. Engine tests (node): deterministic, valid run true, wrong seed/skipped round/empty false, random 3-tap win 0.21%, min landing window 110 ms over 4,000 gifts. Browser: scripted player cleared 3 rounds, reveal + gas-free button shown. tsc clean.
- Design debt: current look = near-black + single acid-green accent (a generic default). Revisit identity in Phase 3.

- 25 Oct 15:40: **LIVE at https://flat-relay.vercel.app** (separate Vercel Hobby account, not Haze Protocol; deployed via CLI from `app/`). `RELAYER_PRIVATE_KEY` stored as Vercel Secret (Production). Checked: /api/relay enabled (testnet on, mainnet off: unfunded); /proof reads mainnet: 2 campaigns, 2 claims, 20 $WIF claimed, 0.2 burned.

## Next action (Phase 2)
1. ~~Scaffold app, /proof live locally~~ done. ~~Deploy~~ done.
2. ~~GitHub repo~~ public at https://github.com/flatrelay/flat-relay (pushed as `flatrelay` via fine-grained PAT, expires 24 Nov). **Vercel auto-deploys from `main`** (root dir `app`; first git deploy e94d2ae Ready 25 Oct 16:14). Commits must be authored as `flatrelay <347689687+flatrelay@users.noreply.github.com>` (set in repo git config) or Vercel ignores them. ~~Fund mainnet relayer~~ done. Next: Upstash shared rate limits; Phase 3 (design identity, relay map, refund button, refund on-chain test).
2. Gift-mode create flow + claim page (link `#k=` key, sign in browser).
3. `/api/relay` (gasless submit) then `/api/ticket` + first game.
