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

The frontend uses the real API by default. It sends cookie credentials, Origin-compatible writes,
CSRF tokens and idempotency keys. An opt-in fixture transport is available only with
`VITE_DEMO_MODE=true`; it shows a persistent “Demo data — no transactions” banner and rejects
writes. Backend errors, including 501/503, are shown as errors and never replaced with fixtures.

Set `VITE_API_BASE` (defaults to `http://localhost:3001`) and `VITE_PROGRAM_ID` in a local web
environment. The program ID must match the compiler-generated IDL and the API's `SEATBACK_PROGRAM_ID`.
`VITE_SEATBACK_PROGRAM_ID` and `VITE_API_BASE_URL` are compatibility aliases; conflicting values
are rejected. An explicitly empty API base uses the browser origin (Docker/Nginx). API requests
and transaction submission share the same configuration. See `docs/docker.md` for Compose setup.
The client accepts only Devnet intents, checks the expected signer and immutable message, signs
through Phantom, submits to the API and polls for finalized receipts. A pending receipt is never
shown as success. Phantom account changes clear the browser session. Never use Mainnet or real funds.

## Included screens

- Public event search/list and event detail with local and UTC time, deposit rules, and capacity.
- Organizer event list, event creation form, participant table, scanner/cancellation surfaces.
- Participant registration history, waitlist offers, registration detail, cancellation/refund and
  dispute interfaces.
- Manual/camera scanner shell and an arbiter dispute review screen.
- Phantom connect and domain-bound signed-message session flow using the documented auth routes.

Wallet connection is not login. Sign-in uses the backend challenge/verify flow. The backend
constructs and validates transaction instructions; the client additionally checks the generated
IDL program address, expected signer and immutable transaction message before signing. Attendance
verification requires scanner and participant signatures on the same message. QR token camera input
supports a manual fallback; scanning alone is never described as confirmed attendance.

The checked-in generated IDL currently contains a placeholder program address, and no Devnet
deployment address or deployment credentials are supplied. The transaction client therefore fails
closed until the real Devnet program is deployed, the compiler-generated IDL is regenerated, and
`VITE_PROGRAM_ID` is set to that address. Live registration, refunds, scanner co-signing and other
on-chain actions cannot be exercised without that deployment plus the PostgreSQL/API/worker setup
described in `docs/backend-integration.md`.

## Checks

```sh
pnpm --filter @seatback/contracts build
pnpm --filter @seatback/web typecheck
pnpm --filter @seatback/web test
pnpm --filter @seatback/web build
```

The focused tests cover decimal SOL/lamport conversion, refund policy boundaries, explicitly opted-in
read-only fixtures, API credential/error behavior, expiry fields and the non-confirming QR path.
Browser-level Phantom, camera, Devnet and PostgreSQL interactions require those live services.
