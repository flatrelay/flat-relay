# Submission checklist

Deadline: **2 Nov 2026 17:30 UTC** (3 Nov 01:30 SGT). Target: 2 Nov 18:00 SGT.

- [ ] Live app URL works on desktop and mobile (https://flat-relay.vercel.app live 25 Oct; mobile check pending)
- [ ] Verified mainnet RelayEscrow on Blockscout
- [x] Real $WIF campaign + claim (incl. gas-free) + refund tx hashes in `TEST_EVIDENCE.md` (25 Oct)
- [x] Repo public: https://github.com/flatrelay/flat-relay (25 Oct)
- [ ] Demo video 90–120 s
- [ ] One-liner, 100-word description, technical write-up
- [ ] Categories: Games, Social and Creators, Consumer and Payments (+ Onboarding if gasless claim live)
- [ ] Team info, team lead wallet (passes sanctions screening)
- [ ] Security limitations and trust assumptions stated
- [ ] Inspect the signed-in submission form fields by 31 Oct
- [ ] Ask in WIF Discord: more than one project per team allowed?
- [ ] Portal shows submission confirmed
- [ ] App + relayer stay up until 6 Nov 17:30 UTC


---

# Submission copy (draft, 25 Oct)

## Name
FLAT//RELAY

## One-liner
Send $WIF as something to play: fund a gift, share a link, and whoever lands the sun on the horizon claims it, gas-free, on Robinhood Chain.

## Short description (≈100 words)
FLAT//RELAY turns a $WIF transfer into a moment. You fund a gift in an immutable escrow on Robinhood Chain, choose how many people can claim and when it expires, and get one link. The link carries a one-time key, so no server ever holds your gift. Whoever opens it plays Flat Line, a 20-second timing game, then claims to any address: no wallet app and no gas, because a rate-limited relayer pays it. Every gift burns 1% of its $WIF. Unclaimed $WIF returns to the sender after expiry. A public proof page and relay map show every gift, claim and burn, read straight from the chain.

## What it does with $WIF
- **Utility:** a programmable gift / giveaway primitive for $WIF (1 to 10,000 claimers per gift, expiry up to 30 days, refunds).
- **Burn:** 1% of every funded gift is burned on creation by calling $WIF's own `burn()`; total supply visibly drops (999,999,999.9 after the first mainnet gift).
- **New holders:** claimers need nothing but an address, so a link can onboard someone who has never touched Robinhood Chain.
- **Flywheel:** after claiming, "Pass it on" prefills a new gift that splits what you received between two people; the relay map draws each hand-off.

## How it works (technical)
- `RelayEscrow.sol` (Solidity 0.8.28, OpenZeppelin 5.1): `createCampaign` pulls pool + 1%, checks the received amount, burns the 1%; `claim` takes an EIP-712 ticket (`campaignId, recipient, deadline`) signed by the gift's throwaway key; one claim per address; creator-only `refund` after expiry. No owner, no admin, no upgrade path, no unlimited approvals. 18 Foundry tests incl. fuzz.
- Mainnet escrow `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426`, source verified (Sourcify exact match).
- Gift key lives only in the URL fragment (`#k=`), which browsers never send to servers. The claim page signs a ticket for the chosen recipient in the browser.
- Gas-free claims: `/api/relay` simulates first, then submits with a small hot wallet. Guards: min 1 $WIF per claim, per-IP and per-recipient limits and a daily cap shared across instances (Upstash Redis), a cross-instance send lock, balance floor. The relayer cannot change where funds go: the ticket fixes the recipient.
- Next.js 15 App Router, wagmi/viem, Tailwind, Vercel. No database: the proof page and relay map read contract events directly (chunked `eth_getLogs`).

## Proof on mainnet
Fill from `TEST_EVIDENCE.md` at submission time: gifts created, claims (incl. gas-free), $WIF burned, refund tx.

## Trust assumptions and limitations (state these honestly)
- In gift mode the game is the ritual, not anti-cheat: anyone holding the link can claim without playing. Share links privately. (Open-challenge mode with server-verified replays is designed, not shipped.)
- The relayer is a centralised convenience. If it is down or out of gas, anyone can still claim by paying gas from their own wallet.
- Rate limits reduce draining of the relayer's gas; they are not Sybil resistance.
- The contract is immutable: bugs can't be patched, but nobody can seize funds either.

## Links
- App: https://flat-relay.vercel.app
- Proof + relay map: https://flat-relay.vercel.app/proof
- Code: https://github.com/flatrelay/flat-relay
- Contract: https://robinhoodchain.blockscout.com/address/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426 · https://repo.sourcify.dev/4663/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426

## Categories
Games · Social and Creators · Consumer and Payments · Onboarding (gas-free paste-address claim is live)

---

# Demo video script (target 100 s, screen recording + voice-over)

| Time | Screen | Voice-over |
|---|---|---|
| 0–8 s | Landing page; hover the sun so it turns | "Sending crypto is a transfer. FLAT//RELAY makes it something to play." |
| 8–25 s | `/create`: 5 $WIF × 2 claims, 1 day, Flat Line, message. Show "Burned (1%)". Approve + create in wallet | "Pick an amount and how many people can claim. One percent of every gift is burned, straight from $WIF's supply." |
| 25–32 s | Share link appears; copy | "You get one link. The key is in the link itself, so no server ever holds your gift." |
| 32–55 s | Phone-sized window, open link: "Play to open it", play 3 rounds of Flat Line (one miss is fine) | "Your friend opens it and plays Flat Line: land the sun on the horizon three times. It gets faster, and the sun drifts." |
| 55–70 s | Reveal amount; paste an address; "Claim gas-free"; tx link | "They paste any address. No wallet app, no gas: our relayer pays it, and it can't redirect the funds." |
| 70–82 s | "Pass it on" → prefilled `/create` | "Then they can pass it on, splitting what they got between two more people." |
| 82–95 s | `/proof`: stats, relay map, event list; click a tx to Blockscout | "Every gift, claim and burn is on chain. The relay map draws who gifted whom." |
| 95–100 s | `/gifts` showing a reclaimed gift | "Unclaimed $WIF comes back after expiry. Live on Robinhood Chain mainnet today." |

Recording notes: use mainnet with small amounts; 1280×800 browser + a narrow window for the phone view; close other tabs and hide the bookmarks bar; record the game in one take (practice first); keep wallet popups visible (they prove it's real).
