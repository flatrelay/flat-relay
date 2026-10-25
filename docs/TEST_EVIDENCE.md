# Test evidence

## 24 Oct 2026: compile and EVM execution (pre-Foundry)

**Compile:** solc `0.8.28+commit.7893614a`, optimizer 10,000 runs, evm `shanghai`, OpenZeppelin 5.1.0, forge-std 1.9.4.
All four files (`RelayEscrow.sol`, `MockWIF.sol`, `RelayEscrow.t.sol`, `Deploy.s.sol`) compile with 0 errors and 0 warnings.
Runtime size: RelayEscrow 8,202 bytes, MockWIF 2,795 bytes.

**Execution:** compiled bytecode run in `@ethereumjs/vm` 8.1.1 (Shanghai), tickets signed with viem 2.21.45 `signTypedData`.
This mirrors the Foundry suite; the Foundry run itself is still to do on the Mac.

| Result | Scenario |
|---|---|
| PASS | create pulls pool and burns 1% |
| PASS | bad config reverts (7 cases) |
| PASS | claim via relayer pays named recipient |
| PASS | ticket cannot be redirected |
| PASS | replay reverts (same + fresh ticket) |
| PASS | wrong signer reverts |
| PASS | ticket for other campaign reverts |
| PASS | ticket for other contract reverts |
| PASS | ticket for other chain reverts |
| PASS | same ticket valid on its own chain (4663) |
| PASS | expired ticket reverts |
| PASS | claim at expiry reverts, 1s before succeeds |
| PASS | exhaustion reverts, escrow empties |
| PASS | unknown campaign reverts |
| PASS | refund after expiry returns unclaimed, then NothingToRefund |
| PASS | refund before expiry reverts |
| PASS | refund by non-creator reverts |
| PASS | malleable (high-s) signature rejected |
| PASS | randomized accounting conserved (40 runs) |

Execution gas (excludes 21k base + calldata): createCampaign 160,202 · claim 71,337.

Also confirmed: viem's EIP-712 signature matches the contract's `hashTicket`, so the frontend can sign tickets the same way.

## Foundry

**24 Oct, run 1 (Mac, forge, solc 0.8.28):** 16/18 passed, 1,000 fuzz runs each on the 2 fuzz tests.
2 failures were test bugs, not contract bugs: `_sig()` makes an external call (`escrow.hashTicket`),
so placing it in the argument list after `vm.expectRevert` made Foundry expect the revert on that call.
Fixed in `test_claim_wrongSignerReverts` and `test_claim_ticketForOtherCampaignReverts` by signing first.

**24 Oct 21:42 SGT, run 2: 18/18 PASS** (0 failed, 0 skipped, 171.76 ms)
- testFuzz_accountingConserved: 1,000 runs, μ gas 1,024,135
- testFuzz_expiryBoundary: 1,000 runs, μ gas 401,607
- All 16 unit tests pass, incl. wrongSigner (310,829) and ticketForOtherCampaign (529,648) after the expectRevert ordering fix.

## Testnet transactions (chain 46630)

**24 Oct 21:35 SGT, deploy** from deployer `0xBD1abD235BfB3B27491584e07C9b4bfCa4AA1562`
- MockWIF (TESTNET ONLY): [`0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426`](https://explorer.testnet.chain.robinhood.com/address/0x7edcfb2efae4b42b6b3e79e64ab4a8bd677aa426)
- RelayEscrow: [`0x7fA3034c337C9D6bd9a2bb606F915640b16B7ebe`](https://explorer.testnet.chain.robinhood.com/address/0x7fa3034c337c9d6bd9a2bb606f915640b16b7ebe)
- Blockscout verification submitted for both (Response OK).
- Checked over RPC: `escrow.wif()` = MockWIF; deployed runtime code is 8,202 bytes, same length as the tested build; deploy cost ~0.000026 ETH.

Deploy txs: [MockWIF](https://explorer.testnet.chain.robinhood.com/tx/0x428617a4dd44754fc9be4eae871dce110ca9e9cce276f86ae4aa9311195b5892) · [RelayEscrow](https://explorer.testnet.chain.robinhood.com/tx/0xdfcf4a58368b4cead739d535a5bce5eb78d5f99b93cdfce87b92f07f6e29755c)

**24 Oct ~21:38 SGT, gift e2e PASS** (`GiftE2E.s.sol`, first run hit stack-too-deep; fixed by splitting into helpers)

| Step | Tx | Gas |
|---|---|---|
| approve exactly 10.1 mWIF | [0xa92e…4d64](https://explorer.testnet.chain.robinhood.com/tx/0xa92e5fabe3a9fb0d3baa2ccf6b467df550d85ad69ae004503b8c0cfce5284d64) | 46,317 |
| createCampaign #1 (burns 0.1) | [0x418d…b337b](https://explorer.testnet.chain.robinhood.com/tx/0x418da29e07521ef49853049a3c7109ea50b3a33b9ccb9de3baec8f6b91db337b) | 185,562 |
| claim to fresh recipient | [0x5848…63ed](https://explorer.testnet.chain.robinhood.com/tx/0x58487321583fb74934e184d0eb3cad37abe801716ef3d25e3d86202fa64563ed) | 96,929 |

Total 0.0000033 ETH. Independently checked over RPC afterwards:
- all 3 receipts status 1; `CampaignCreated.burned` = 0.1 mWIF
- recipient `0x5A20A372610bbF9A2e4bF97Fa5f65aeAA67DE965` holds 10 mWIF; `claimed(1, recipient)` = true
- campaign #1: claimCount 1, remaining 0; escrow balance 0
- MockWIF totalSupply = 999,999,999.9 (1B minus the 0.1 burn)
- gift signer `0x6ebAb985f118ed9949ed0a8f35a7827ed4CeEe12` was a throwaway key; claim was submitted by the deployer, paid to the recipient

### 25 Oct, app click-through on testnet (user's browser wallet + MetaMask) PASS
Read back from chain (chunked getLogs):
| Gift | Event | Detail | Tx |
|---|---|---|---|
| #2 (via cast, 10×10 mWIF, 1 burned) | Claimed | 10 mWIF via the `/g/46630/2#k=…` link | 0xae7b1af8b4… |
| #3 (via `/create`, 1×10 mWIF) | CampaignCreated | burned 0.1 mWIF | 0x8806145759… |
| #3 | Claimed | 10 mWIF via the generated share link | 0x6a0bff38bd… |
Note: these txs were sent from `0xBD1a…1562` (the deployer address).

### 25 Oct 14:35, relayer funded (testnet)
- Relayer (gas-free claims) address: `0x0F3c330bFbC8F21951dAd6cf2e82aF96fdbEa994` (key only in `app/.env.local`, git-ignored)
- Funded 0.005 testnet ETH from deployer: [0xc5fa…7c31](https://explorer.testnet.chain.robinhood.com/tx/0xc5fa5997c51270e51762c51892f1036bf11b68bf36ff1e934199e44f52a97c31), block 142,298,187, status 1

### 25 Oct 14:40, /api/relay checks (local, testnet relayer enabled)
GET → `{"enabled":true,"address":"0x0F3c…a994","minRewardWif":1,"chains":[{4663:false},{46630:true}]}` (mainnet off: unfunded).
POST rejected before any tx (no gas spent):
| Case | Response |
|---|---|
| unsupported chain | 400 Unsupported chain. |
| bad address | 400 Invalid recipient address. |
| short signature | 400 Invalid signature. |
| deadline +24h | 400 Ticket deadline out of range. |
| forged 65-byte signature | 400 This link's signature is invalid. (after adding OZ ECDSA errors to ABI) |
| unknown campaign 999 | 404 This gift doesn't exist. (after adding creator==0 check) |

### 25 Oct 14:45, GAS-FREE CLAIM PASS (testnet)
Browser with no wallet → `/g/46630/2#k=…` → pasted `0x5A20…E965` → "Claim 10 mWIF, gas-free".
Tx [0x9f3a…1d071](https://explorer.testnet.chain.robinhood.com/tx/0x9f3acf804d6cd522bf6c794496db1e999682a34cd85084ac670e0bf68fb1d071): status 1, **from relayer 0x0F3c…a994**, 84,629 gas (0.00000085 ETH), Transfer 10 mWIF escrow → 0x5A20…E965. Relayer left: 0.004999 ETH.
UX fix after: while relay status loads the button says "Checking gas-free claiming…" (it briefly said "Connect a wallet", which confused the user's test).

## Mainnet transactions (chain 4663)

**24 Oct 22:38 SGT, deploy** from deployer `0xBD1abD235BfB3B27491584e07C9b4bfCa4AA1562`
- RelayEscrow: [`0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426`](https://robinhoodchain.blockscout.com/address/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426), tx [0xe910…d198](https://robinhoodchain.blockscout.com/tx/0xe9100599bff7efb4aeb210f08432bfd51d19068c5d27f138d72296f4f712d198), block 96,835,584, 1,849,111 gas, 0.0000372 ETH
- Checked over RPC: status 1; `wif()` = real $WIF `0x5173…4773`; `BURN_BPS` = 100; `campaignCount` = 0; runtime 8,202 bytes, same as tested build.
- Note: same address as the testnet MockWIF, because both were the deployer's first transaction (nonce 0) on each chain. Always state the chain next to the address.

**Source verification: Sourcify EXACT MATCH** (24 Oct 23:56 SGT): creation and runtime bytecode both `exact_match`, job `192bf0f8-086f-4e63-8ff8-221f69a80e55`.
Public proof: https://repo.sourcify.dev/4663/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426
Blockscout: `forge verify-contract --verifier blockscout` blocked by Cloudflare "Just a moment" on the mainnet API; two web-form submissions did not register. Blockscout still showed unverified at 23:58; recheck later.
**25 Oct 00:05 SGT, MAINNET GIFT E2E PASS. Gate passed (2 days early).** Real $WIF, recipient = deployer.

| Step | Tx | Block | Gas | Verified on chain |
|---|---|---|---|---|
| approve exactly 10.1 $WIF | [0xedba…b585](https://robinhoodchain.blockscout.com/tx/0xedba7d5cfb1174ca1cbadf632ad2669ab35d2962995758417f6266be9d7bb585) | 96,887,830 | 45,949 | status 1 |
| createCampaign #1 | [0x2a58…3538](https://robinhoodchain.blockscout.com/tx/0x2a58382d540c725dc13fd92914a60434ea88e612d0d3ad337287725c46e53538) | 96,887,863 | 185,065 | 10.1 $WIF deployer→escrow; **0.1 $WIF escrow→0x0 (burned)**; CampaignCreated |
| claim (gift-key ticket) | [0xf9d5…d426](https://robinhoodchain.blockscout.com/tx/0xf9d5dd4a57f21dd0b6d5ca9addcd52ba4f7bd610aea9f29a53a686dea1ced426) | 96,887,896 | 79,722 | 10 $WIF escrow→recipient; Claimed |

Total gas 0.0000063 ETH. Afterwards (RPC): escrow holds 0 $WIF; deployer 1,553.68 $WIF (net −0.1); **$WIF totalSupply 999,999,999.9** (real supply reduced by the burn). Gift signer `0x042Cc2f4d4FC3586618B610c188650B2f3b676ba` (throwaway).
Rehearsal 1 failed on a script-only check (absolute balance vs. pre-funded recipient); fixed to check balance change.

**25 Oct ~14:50 SGT, first real $WIF gift through the app UI (mainnet)**
| Event | Detail | Tx |
|---|---|---|
| CampaignCreated #2 (via `/create`) | 1 × 10 $WIF, 0.1 $WIF burned, creator 0xBD1a…1562 | [0x9164…5a7e](https://robinhoodchain.blockscout.com/tx/0x9164b85e87828c91519644daa1fdd90d7b495f4421d9255627c1d5d4b76b5a7e) |
| Claimed #2 (via `/g/4663/2#k=…`, wallet-paid gas) | 10 $WIF → 0xe298c55A7fe5205c170ba640ee7f659966bF8051, submitted by 0xBD1a…1562 | [0x30d9…a704](https://robinhoodchain.blockscout.com/tx/0x30d9e659010f4f4da4cd606fda26669198c65f6c4b29164bc827a8364f30a704) |
Mainnet relayer 0x0F3c…a994: 0 ETH → gas-free disabled on 4663 (by design until funded).

### 25 Oct 15:10, Flat Line game engine + UI
- Node (`--experimental-strip-types`): same seed → identical rounds; different campaign → different rounds; `verifyRun` valid run = true, miss-then-hits = true, wrong seed = false, skipped round = false, empty = false; random 3-tap runs win 0.21% (20,000 trials); position always within 0..1.
- Difficulty: smallest landing window across 4,000 sample gifts = 110 ms (round 3); round 1 ≈ 300 ms.
- Browser (localhost, testnet gift #2 with `&t=flatline`): scripted player pressed Space 3× → "Unlocked … no misses" → amount + gas-free claim shown.

### 25 Oct 16:13, mainnet relayer funded
- 0.002 ETH deployer → relayer `0x0F3c…a994`: [0x90ea…83bf](https://robinhoodchain.blockscout.com/tx/0x90eacdfc71163919dc7f01f2ba28276c57ecfdef19b624c856eb949ce2ec83bf), block 97,441,452, status 1.
- Live https://flat-relay.vercel.app/api/relay → `4663: enabled true`, `46630: enabled true`. Deployer mainnet ETH left ≈ 0.00101.


### 25 Oct 16:50, refund test gift #3 (mainnet, via the live UI)
| Event | Detail | Tx |
|---|---|---|
| CampaignCreated #3 (`/create`, 1-hour expiry) | 2 × 1 $WIF, **0.02 $WIF burned**, creator 0xBD1a…1562, signer 0xbd2c…13d0, expiry 1792921503 (25 Oct 17:45:03 SGT), block 97,459,699 | [0x433d…6c91](https://robinhoodchain.blockscout.com/tx/0x433dd40d34abd0449d7c344e17e4c8bce5efe891e684a36367a33617a3eb6c91) |
| Claimed #3, **gas-free** (relayer 0x0F3c…a994 submitted) | 1 $WIF → 0xe298…8051, block 97,460,788 | [0x4389…7766](https://robinhoodchain.blockscout.com/tx/0x438961f919f6e6a75606de455069d15eae79505f640fd9f6463cf1d399ac7766) |
State at 16:50 (getCampaign(3)): claimCount 1/2, remaining 1 $WIF, 54 min to expiry. First **mainnet gas-free claim**. **Refund PASS (25 Oct 19:10:35 SGT, via `/gifts` → Reclaim):** [0xf4cf…55e8](https://robinhoodchain.blockscout.com/tx/0xf4cf808cc59a55f97440e0d256c6f5684b9dc0ae640a087fb89d89628f2c55e8), block 97,541,978, status success, gas 44,545, sent by creator 0xBD1a…1562. Refunded event 1 $WIF; $WIF Transfer escrow → creator 1 $WIF. Afterwards getCampaign(3): claimCount 1, remaining 0. **All three contract paths (create+burn, claim, refund) now exercised on mainnet.**

### 25 Oct 17:00, relay map (`lib/relaymap.ts`)
- Node test, 8 synthetic events: edges creator→recipient per claim, self-claim excluded and counted, depth A0→B1→C2/D2, B and C flagged "passed it on" (funded after first receiving), C→A loop handled (no infinite BFS), longest chain 2.
- Rendered with React server render on 6 wallets / 6 hand-offs incl. a back-loop; checked visually in the browser. Live mainnet data: 2 wallets, 2 hand-offs (#2, #3), 1 self-claim (#1) not drawn.

### 25 Oct 20:52 SGT, gift #4 after the review fixes (mainnet, live site)
| Event | Detail | Tx |
|---|---|---|
| CampaignCreated #4 | 1 × 1 $WIF, 0.01 $WIF burned, creator 0xBD1a…1562, block 97,599,986 | [0x6820…95d8](https://robinhoodchain.blockscout.com/tx/0x68202968ed5599a93546d35e5d351d9cc3522ab3a7134f8ae2af3104ba2395d8) |
| Claimed #4, **gas-free** (sent by relayer 0x0F3c…a994) | 1 $WIF → 0x2847Df43434B2979CB89B4F64205724d73F4879e, block 97,601,320, status success | [0x892a…122a](https://robinhoodchain.blockscout.com/tx/0x892a45297b92b8898f53910767713d2702301ab7563ac7ba48d17041f8e6122a) |
Recipient 0x2847…879e is a friend of the team lead (not a team wallet): **first claim by someone outside the team**, so it is not tagged "team test" on Proof. User-run click-through of the new claim screen (skip game, pending state) on the deployed build `8bc1012`. Live checks: /play 200, /opengraph-image 200 image/png, /api/relay `limits: shared`, /api/activity returns 9 events with times.
