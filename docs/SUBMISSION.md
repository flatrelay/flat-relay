# Submission checklist

Deadline: **2 Nov 2026 17:30 UTC** (3 Nov 01:30 SGT). Target: 2 Nov 18:00 SGT.

- [ ] Live app URL works on desktop and mobile (https://flat-relay.vercel.app live 25 Oct; mobile check pending)
- [ ] Verified mainnet RelayEscrow on Blockscout (blocked on Blockscout's side, see PROJECT_STATE 25 Oct 19:25; Sourcify exact match done; reported to support)
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
Land the sun, keep the $WIF: send $WIF as a link your friends play to open, claim gas-free on Robinhood Chain, and pass on. Every gift burns 1%.

## Short description (≈100 words)
FLAT//RELAY turns a $WIF transfer into a moment. You fund a gift in an immutable escrow on Robinhood Chain, choose how many people can claim and when it expires, and get one link. The link carries a one-time key, so no server ever holds your gift. Whoever opens it plays Flat Line, a 20-second timing game, then claims to any address: no wallet app and no gas, because a rate-limited relayer pays it. Every gift burns 1% of its $WIF. Unclaimed $WIF returns to the sender after expiry. A public proof page and relay map show every gift, claim and burn, read straight from the chain.

## What it does with $WIF
- **Utility:** a programmable gift / giveaway primitive for $WIF (1 to 10,000 claimers per gift, expiry up to 30 days, refunds).
- **Burn:** 1% of every funded gift is burned on creation by calling $WIF's own `burn()`; total supply visibly drops (999,999,999.9 after the first mainnet gift).
- **New holders:** claimers need nothing but an address, so a link can onboard someone who has never touched Robinhood Chain.
- **Flywheel:** after claiming, "Pass it on" prefills a new gift that splits what you received between two people; the relay map draws each hand-off.

## How it works (technical)
- `RelayEscrow.sol` (Solidity 0.8.28, OpenZeppelin 5.1): `createCampaign` pulls pool + 1%, checks the received amount, burns the 1%; `claim` takes an EIP-712 ticket (`campaignId, recipient, deadline`) signed by the gift's throwaway key; one claim per address; creator-only `refund` after expiry. No owner, no admin, no upgrade path, no unlimited approvals. 18 Foundry tests incl. fuzz.
- Mainnet escrow `0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426`, source verified on Sourcify (exact match of creation and runtime bytecode): https://repo.sourcify.dev/4663/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426
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

## What's next (after the hackathon)
**Relay pool: rewarding the pass-on, not the hold.** Sponsors (the WIF community, Robinhood Chain projects, us) deposit $WIF into a pool. When someone claims a gift and then sends a gift of their own, the pool tops up that new gift (for example +20%), so passing $WIF on is worth more than sitting on it.
- **Checkable on chain:** a separate pool contract checks with RelayEscrow's public `claimed(giftId, address)` record that the new gift's sender really received an earlier gift. No server has to vouch for it.
- **Bounded:** a per-gift cap and a per-wallet cap, the pool only pays into the escrow (never straight to a wallet), and it's funded by sponsors, not from fees or new tokens.
- **Same rules as today:** no admin keys over user funds, the 1% burn still applies to every topped-up gift, and anything left over returns to the sponsor after the pool ends.
- **Not built yet.** It would be a new contract holding funds, so it gets its own tests and review before mainnet.

Also next:
- **Leaderboard seasons with prizes:** time-boxed seasons on the Longest chains and Widest reach boards, with the winners' prizes paid as new gifts (so even prizes get passed on). Prizes invite farming between your own wallets, so seasons come only with clear rules: outside wallets only and a minimum gift size, with winners checkable on chain.
- **Open-challenge mode:** public links where the server replays the game before issuing a claim ticket (the replay check already exists in the code).
- **More games:** more templates on the same escrow.

## Links
- App: https://flat-relay.vercel.app
- Demo video: https://www.youtube.com/watch?v=Nuu1TgPQvUk (Unlisted, English captions; also plays on the home page)
- Proof + relay map: https://flat-relay.vercel.app/proof
- Code: https://github.com/flatrelay/flat-relay
- Contract: https://robinhoodchain.blockscout.com/address/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426 · https://repo.sourcify.dev/4663/0x7EDCfb2efaE4b42B6b3E79e64aB4A8bD677AA426

## Categories
Games · Social and Creators · Consumer and Payments · Onboarding (gas-free paste-address claim is live)

---

# Demo video script (target 110 s, screen recording + voice-over; updated 25 Oct for the review fixes)

| Time | Screen | Voice-over |
|---|---|---|
| 0–8 s | Landing page ("Land the sun. Keep the $WIF."); hover the sun so it turns | "Sending crypto is a transfer. FLAT//RELAY makes it something you play: land the sun, keep the $WIF." |
| 8–18 s | Click "Try the game, free" → `/play`, land the sun once or twice | "You can try the game right now. No wallet, nothing is paid." |
| 18–35 s | `/create`: 5 $WIF × 2 claims, 1 day, Flat Line, message. Point at "Burned: 1% added on top" and the fee note. Connect menu (Browser wallet / WalletConnect) → approve (step 1 of 2) → create (step 2 of 2) | "Pick an amount and how many people can claim. One percent is burned on top, straight from $WIF's supply. Connect with a browser wallet or WalletConnect." |
| 35–42 s | Link appears + "How links work" list; copy | "You get one link. The key lives in the link, so no server ever holds your gift." |
| 42–62 s | Phone-sized window, open link: message, "Play to open it" (show "Open without playing" underneath), play 3 rounds | "Your friend plays Flat Line: land the sun three times. Can't play? They can skip it." |
| 62–75 s | Amount reveal; paste a Robinhood Chain address; "Claim gas-free"; "Sent, waiting for confirmation" → done | "They paste their address. No wallet app, no gas: our relayer pays, and it can't redirect the funds." |
| 75–85 s | "Pass it on" → prefilled `/create` with the split | "Then they can pass it on, split between two more people." |
| 85–100 s | `/gifts`: "Where it went" for a claimed gift; `/proof`: stats with definitions, relay map, **Leaderboard** (Longest chains / Widest reach, $WIF burned), an event → Blockscout | "Senders see where their gift travelled. Every gift, claim and burn is on chain, and the leaderboard ranks who passes $WIF on furthest, leaving our own wallets out." |
| 100–110 s | `/gifts` reclaim on an expired gift, then end on landing | "Unclaimed $WIF can be reclaimed after expiry. Live on Robinhood Chain mainnet." |

Recording notes: record after a few real (non-team) claims exist so Proof isn't all "team test"; mainnet, small amounts; 1280×800 window + a 375 px window for the phone view; hide bookmarks and other tabs; practise the game first; keep wallet pop-ups visible (they show it's real); don't show a full gift link on screen for longer than needed (anyone who reads it can claim).
