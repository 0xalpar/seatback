# SeatBack web frontend

React + TypeScript + Vite client for the SeatBack Devnet prototype. This app uses only the shared
wire types from `@seatback/contracts`; it does not implement or assume Anchor instructions.

## Run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @seatback/contracts build
pnpm --filter @seatback/web dev
```

The frontend runs in clearly marked demo mode by default. Its fixture data is isolated in
`src/api.ts`, appears with a persistent “Demo data — no transactions” banner, and rejects writes
with an explicit 501-style error. The demo cannot sign or submit transactions.

To point at the API skeleton, use `VITE_DEMO_MODE=false` and optionally `VITE_API_BASE` (defaults
to `http://localhost:3001`). The current API returns 501 for business routes, and those errors are
shown as unavailable. Never switch the app to Mainnet or use real funds.

## Included screens

- Public event search/list and event detail with local and UTC time, deposit rules, and capacity.
- Organizer event list, event creation form, participant table, scanner/cancellation surfaces.
- Participant registration history, waitlist offers, registration detail, cancellation/refund and
  dispute interfaces.
- Manual/camera scanner shell and an arbiter dispute review screen.
- Phantom connect and domain-bound signed-message session flow using the documented auth routes.

Wallet connection is not login. Transaction submission stays disabled until the generated
chain-client/IDL can validate transaction network, program, signer, instructions, recipients, and
amounts. Scanner assignments and some write paths remain unavailable in the current API skeleton.
QR token camera input supports a manual fallback; a scan is never described as confirmed attendance
without the participant co-sign and chain receipt.

## Checks

```sh
pnpm --filter @seatback/contracts build
pnpm --filter @seatback/web typecheck
pnpm --filter @seatback/web test
pnpm --filter @seatback/web build
```

The focused tests cover decimal SOL/lamport conversion, refund policy boundaries, read-only mock
behavior, expiry fields, and the non-confirming QR path. Browser-level Phantom, camera, and live API
checks require the backend and wallet extension and have not been run as part of these unit tests.
