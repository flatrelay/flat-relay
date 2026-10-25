# FLAT//RELAY: Claude working rules

World Is Flat $WIF hackathon entry. Submit by **2 Nov 2026 18:00 SGT** (deadline 2 Nov 17:30 UTC).
Blueprint (source of truth for scope): https://claude.ai/artifact/JhkKAYpHrtWbASCNFa5UxS

## Start every session
1. Read `docs/PROJECT_STATE.md`, do its **Next action**.
2. One small testable objective per session. Run tests after every change.
3. End by updating `docs/PROJECT_STATE.md` (done / blockers / next action).

## Report format
Objective · Files · Implementation · Verification · Risk · Next action. Keep it short.

## Hard rules
- Never hold or ask for the user's main private key. Mainnet txs only with explicit user go-ahead.
- Never show simulated transactions as real. Testnet token is **MockWIF**, always labelled.
- No owner/admin/upgrade on RelayEscrow. No unlimited approvals. No new tokens. No gambling (players never pay).
- Don't claim "decentralized" or "Sybil-proof". Open mode trusts the verifier; say so.
- Freeze features 31 Oct 23:59 SGT.

## Key facts
| | |
|---|---|
| Mainnet | chain 4663, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` |
| Testnet | chain 46630, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com`, faucet: Alchemy |
| $WIF | `0x5173b8eA6923c2d40267890D45C46a3480954773`, 18 decimals, 1B supply, has `burn`/`burnFrom`, no owner, no permit |
| EIP-712 | domain `FlatRelay` v`1`; `Ticket(uint256 campaignId,address recipient,uint256 deadline)` |
| Burn | 1% of the reward pool, burned at creation on top of the pool (`fundingRequired`) |
| Solidity | 0.8.28, evm `shanghai`, OpenZeppelin 5.1.0, forge-std 1.9.4 |
| Mainnet RelayEscrow | `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426` (deploy block 96,835,584), Sourcify exact match |
| Testnet RelayEscrow | `0x7fA3034c337C9D6bd9a2bb606F915640b16B7ebe`, MockWIF `0x7EDC…A426` (same hex as mainnet escrow!) |
| Open items | Blockscout mainnet shows unverified (Cloudflare); refund path not yet run on chain |

## Commands
```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 foundry-rs/forge-std@v1.9.4 --no-git   # first time
forge build && forge test -vv
forge script script/Deploy.s.sol --rpc-url rh_testnet --account deployer --broadcast
forge verify-contract <addr> src/RelayEscrow.sol:RelayEscrow --chain-id 46630 \
  --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
  --constructor-args $(cast abi-encode "c(address)" <token>)
ESCROW=0x... forge script script/GiftE2E.s.sol --rpc-url rh_testnet --account deployer --broadcast
cd ../app && npm install && npm run dev   # http://localhost:3000/proof
```

## Layout
`contracts/` Foundry · `app/` Next.js (app router in `app/app/`, shared code in `app/lib/`) · `scripts/` legacy viem e2e · `docs/` state and evidence
