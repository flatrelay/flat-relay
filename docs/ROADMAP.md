# Roadmap (SGT)

| Date | Milestone | Gate |
|---|---|---|
| 24–25 Oct | Contracts + tests, testnet deploy | `forge test` green |
| 25–26 Oct | Testnet gift e2e; ticket API + relayer | e2e PASS on 46630 |
| **27 Oct** | **Real mainnet campaign funded and claimed** | Miss → gift mode only |
| 27–29 Oct | App: create, claim, 2 games | |
| 29–30 Oct | Proof page, relay map, OG images | |
| 30–31 Oct | Polish, mobile | **Feature freeze 31 Oct 23:59** |
| 31 Oct–1 Nov | Security review, QA, video, copy | |
| **2 Nov 18:00** | **Submit** (deadline 2 Nov 17:30 UTC) | Portal confirms |
| 2–6 Nov | Keep live, monitor relayer | Final closes 6 Nov 17:30 UTC |

## After the hackathon
- **Relay pool:** sponsors deposit $WIF that tops up gifts sent by people who received one (e.g. +20%, capped per gift and per wallet). It's a separate contract that checks RelayEscrow's `claimed()` record on chain, so funds only ever go into the escrow. Needs its own tests and review before mainnet. Full description in SUBMISSION.md, "What's next".
- **Leaderboard seasons with prizes (after 2 Nov):** weekly or monthly seasons on the Longest chains / Widest reach boards, with the top relays winning $WIF (e.g. paid from the relay pool). Prizes invite farming, so it needs rules first: outside wallets only, a minimum gift size, prizes paid into new gifts rather than to wallets, and a public, on-chain way to check the winners. Not before the hackathon closes.
- **Open-challenge mode:** the server replays the game (`verifyRun`) before signing a claim ticket.
- **More game templates.**
