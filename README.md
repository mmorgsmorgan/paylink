# PayLink

Send USDC to a friend with a link. They don't need a wallet or any crypto to receive it: they open the link, choose where the money goes (a wallet created for them in the browser, or their own wallet) and claim. Senders can cancel an unclaimed link and get a refund.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
- Solidity (Foundry) escrow contract on Arc Testnet, USDC

## Development

Prerequisites: [Bun](https://bun.sh), [Foundry](https://getfoundry.sh) (only to rebuild the contract).

```bash
bun install
bun run dev        # app on http://localhost:5173
bun run relayer    # gas relayer on :3001, proxied at /api
```

The relayer pays network fees so a brand-new recipient can claim with a zero balance. Its address must hold a small amount of Arc Testnet USDC. Without it, recipients can still claim with their own funded wallet.

Other commands: `bun run check` (lint and typecheck), `bun run contracts:build`.

### Environment variables

- `VITE_PAYLINK_ADDRESS`: deployed escrow contract address.
- `RELAYER_PRIVATE_KEY`: private key of the relayer account (server only, never commit).
- `RELAYER_PORT`: relayer port, defaults to 3001.
- `RPC_URL_Arc_Testnet`: optional RPC endpoint override for the relayer.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional, provisioned by Arc Studio.
