# PayLink

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What This App Does

Send USDC to a friend with a link. The sender escrows USDC in a contract; the link's URL fragment carries a throwaway private key. The recipient opens the link, picks a destination (a wallet created in their browser, or their own wallet) and claims. A small gas relayer submits the claim so the recipient needs no balance.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`. Build with `bun run contracts:build`.
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals), read from `@/onchain-facts`
- Relayer: `scripts/relayer.ts` (Node http server on :3001, started with `bun run relayer`, proxied by Vite at `/api`)

## Deployed contracts

- PayLink (Arc Testnet): `0x4fe544110e8707150fc4a683012505fcfd15040b`, constructor arg = Arc USDC. Address is in `.env` as `VITE_PAYLINK_ADDRESS`. ABI in `src/contracts/paylinkAbi.ts` (regenerate from `contracts/out/PayLink.sol/PayLink.json` after any contract change).

## Key Files

- `contracts/PayLink.sol` - escrow: `createLink` (key-signed), `claim` (key-signed, names the relayer), `cancel`
- `src/App.tsx` - routes between send view and claim view (claim view = a valid secret in `location.hash`)
- `src/components/` - SendPanel, SentLinks, ClaimView, BrowserWallet, CopyLink
- `src/lib/linkKey.ts` - link key generation and signing; `src/lib/store.ts` - localStorage (sent links, browser wallet)
- `scripts/relayer.ts` - gas relayer; key in `.env` as `RELAYER_PRIVATE_KEY` (never print it)

## Decisions

- Link format: `<share root>#<64 hex secret>`. The secret lives only in the fragment, never in path or query.
- The relayer is bound into the claim signature, so nobody can copy a claim and steal the fee.
- The sender prepays a 0.05 USDC claim fee; the relayer is paid it by the contract. The relayer must hold a little USDC (gas) to start.
- Deploying the app elsewhere needs the relayer hosted too (a backend), plus `RPC_URL_Arc_Testnet` if sustained traffic is expected.

## To Run

```bash
bun install
bun run dev
bun run relayer
```
