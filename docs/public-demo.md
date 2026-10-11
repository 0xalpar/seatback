# Public HTTPS preview

Live read-only URL: https://seatback.alpar-dikkatli37347.chatgpt.site

The public SeatBack Site is a static **read-only example-data demo**, separate from the real local Solana environment. It has no backend/database binding, CORS API exposure, runtime secrets, RPC tunnel or signing capability. Public wallet controls and financial actions are disabled. The build sets fixture mode explicitly and a Content Security Policy blocks all API/RPC connections (`connect-src 'none'`). Nothing displayed is proof of Devnet activity.

Run `node scripts/build-public-demo.mjs` from the repository root to build sanitized assets under ignored `.cache/public-site`. Site identity/configuration is retained in `infra/public-demo/hosting.json`. Publish this exact static output through the Sites source/package workflow; never upload root `.env`, `.cache` generally, validator ledger or external key files. On Windows, use the Linux filesystem for the Sites Git checkout because Windows-mounted filesystem chmod may fail. The hosted source is only the sanitized public build; the application source remains in the existing GitHub repository.

The real local API/worker/PostgreSQL/validator stack remains at http://localhost:5174, using `./scripts/start-local-demo.ps1`. Do not tunnel local RPC, API or gate credentials publicly. The ordinary Devnet setup remains at localhost:5173 until the real program is deployed and independently verified.

The interactive build supports explicit selection of injected Phantom and Solflare extensions, preserving the selected provider across reloads and normalizing message-signature formats. Existing transaction content/signature validation remains unchanged. Provider unit tests are not an actual extension authorization/signing rehearsal. Mobile deep links and WalletConnect are not implemented. Public preview does not connect wallets.

For actual financial demonstrations use the real local rehearsal or, after funding/deployment verification, the Devnet runbook. Never describe example dashboard balances, example QR states or placeholder reservations as real transactions.

Solflare API reference: https://docs.solflare.com/solflare/technical/integrate-solflare/solflare-wallet-sdk
