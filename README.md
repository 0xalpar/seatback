# SeatBack
Solana Devnet event reservations, refundable SOL deposits, QR attendance and free waitlists.
Existing repository: https://github.com/0xalpar/seatback

## Status
Backend MVP implements Anchor escrow, cancellation/attendance refunds, disputes, settlement,
capacity/seat offers, authenticated Node API, PostgreSQL persistence, QR co-signing and workers.
No Devnet deployment or audit is claimed. Never use real funds or deploy to Mainnet.
The release/mvp branch consolidates the integrated frontend/backend and Docker infrastructure.
See docs/release-integration.md and docs/backend-integration.md before starting services.
For operator-owned local keys, pinned WSL tools and guarded Devnet deployment/verification,
follow [docs/devnet-deployment.md](docs/devnet-deployment.md). No deployment credentials are stored in CI.
Use [docs/demo-runbook.md](docs/demo-runbook.md) for startup checks and the live presentation sequence.
For the actual compiled-program demo without public faucet funding, use
[docs/local-validator-demo.md](docs/local-validator-demo.md). It runs separately at localhost:5174
and is explicitly labeled local; the ordinary Devnet configuration remains at localhost:5173.

## Quick start
Prerequisites: Node 24.19.0 and pnpm 11.25.0. Use separate clones on the two computers.
~~~sh
git clone https://github.com/0xalpar/seatback.git
cd seatback
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm check
pnpm dev
# In another terminal:
pnpm dev:api
~~~
Frontend: http://localhost:5173. API: http://localhost:3001/health.
Copy apps/web/.env.example to apps/web/.env.local if needed.
Copy root .env.example to .env and supply the development-only backend values. API/worker scripts
load this file deliberately. Run pnpm db:migrate first; run pnpm dev:worker in a third terminal.
Service startup fails closed without PostgreSQL, a gate keypair, matching IDL and verified Devnet RPC.

## Docker local environment
See [docs/docker.md](docs/docker.md) for Docker Compose setup, external secret files, Devnet
configuration, migrations and frontend integration requirements. After first-time configuration,
run `docker compose up --build`. The Solana program remains deployed separately on Devnet.

## Workspace
- apps/web: React + TypeScript + Vite; Developer 2 (Codex) owns frontend; untouched by backend.
- apps/api: Node + TypeScript API; Codex owns backend.
- apps/worker: finalized intent reconciliation, waitlist offers, no-shows and leased outbox jobs.
- packages/contracts: shared wire types and reference policy arithmetic.
- packages/chain-client: compiler-generated IDL, PDA/encoding helpers and transaction validation (Node entry).
- programs/seatback: Rust + Anchor monetary instructions and constrained state.
- tools/chain-tests: compiled SBF integration tests.
- supabase/migrations: PostgreSQL schema, RLS, immutable snapshots and worker state.
- docs: architecture, API, on-chain specification, security, tests, roadmap and Claude handoff.

## Collaboration
main is the shared reviewed baseline. backend and frontend start at the foundation commit.
Developer 1 works on backend; Developer 2 works on frontend. Open PRs into main. Never force-push main
or commit secrets. Pull main before integration. Coordinate changes to packages/contracts
and lockfiles; backend owns contract changes. See AGENTS.md and docs/frontend-task.md.

## Manual setup before integration
1. Authenticate git/gh separately on both computers; the Codex connector is not a local Git credential.
2. Provision a development Supabase project or local PostgreSQL. Apply migrations only to that DB.
   Configure service role server-side; direct browser table access is intentionally denied by RLS.
3. Rust 1.89.0, Agave 2.3.13, platform tools v1.56 and Anchor 0.32.1 (WSL2/Linux recommended).
   Follow docs/backend-integration.md for compiler-generated IDL and SBF test commands.
4. Generate dedicated development wallet/program keypairs outside Git. Replace placeholder declare_id,
   add programs.devnet to Anchor.toml, sync keys, generate IDL, then build/test locally before devnet deployment.
5. Fund only a dedicated Devnet wallet with faucet SOL. Configure independent dispute authority,
   gate worker signer, access-code pepper and secure session secret. Never send private keys through chat.
6. Configure HTTPS origin, secure cookies, private event code hashing, scheduler and RPC health monitoring.
7. Complete live PostgreSQL/Phantom/Devnet integration with Developer 2 before enabling a deposit UI.

See docs/backend-validation.md for executed checks and current limitations.
