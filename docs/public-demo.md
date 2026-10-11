# Public HTTPS preview

Live read-only URL: https://seatback.alpar-dikkatli37347.chatgpt.site

The public SeatBack Site is a static **read-only example-data demo**, separate from the real local Solana environment. It has no backend/database binding, CORS API exposure, runtime secrets, RPC tunnel or transaction-signing capability. Phantom and Solflare extension connection is available. Financial actions and API authentication are disabled until the hosted backend and Devnet contract are available. The build sets fixture mode explicitly and a Content Security Policy blocks all API/RPC connections (`connect-src 'none'`). Nothing displayed is proof of Devnet activity.

Run `node scripts/build-public-demo.mjs` from the repository root to build sanitized assets under ignored `.cache/public-site`. Site identity/configuration is retained in `infra/public-demo/hosting.json`. Publish this exact static output through the Sites source/package workflow; never upload root `.env`, `.cache` generally, validator ledger or external key files. On Windows, use the Linux filesystem for the Sites Git checkout because Windows-mounted filesystem chmod may fail. The hosted source is only the sanitized public build; the application source remains in the existing GitHub repository.

The real local API/worker/PostgreSQL/validator stack remains at http://localhost:5174, using `./scripts/start-local-demo.ps1`. Do not tunnel local RPC, API or gate credentials publicly. The ordinary Devnet setup remains at localhost:5173 until the real program is deployed and independently verified.

The interactive build supports explicit selection of injected Phantom and Solflare extensions, preserving the selected provider across reloads and normalizing message-signature formats. Existing transaction content/signature validation remains unchanged. Provider unit tests are not an actual extension authorization/signing rehearsal. Mobile deep links and WalletConnect are not implemented. Public preview connects injected Phantom/Solflare wallets but does not create a backend session, sign transactions or associate example records with that wallet. The status explicitly says “Devnet sözleşmesi bekleniyor”. Actual extension user approval remains TEST EDİLMEDİ.

For actual financial demonstrations use the real local rehearsal or, after funding/deployment verification, the Devnet runbook. Never describe example dashboard balances, example QR states or placeholder reservations as real transactions.

Solflare API reference: https://docs.solflare.com/solflare/technical/integrate-solflare/solflare-wallet-sdk

## Latest readiness check
Real Devnet genesis verified as EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG. Dedicated deployer and known participant both have 0 lamports; program account is absent. User-supplied address 4uNngyfja4ogvQK2pq6AqnN7tL68GzkrifEyuDgVr359 has a verified finalized Devnet balance of 10,000,000 lamports (0.01 SOL), at slot 509813992. This is sufficient for small transfers but not contract deployment. User-wallet transaction signing and transfers are TEST EDİLMEDİ pending wallet approval. No deployment or transfer attempted; no funds spent. 0.05 SOL is below the previously calculated approximately 4.94 SOL deployment peak requirement. Public hosting is static; production API/PostgreSQL/worker hosting is not configured. The complete backend stack operates locally only.
