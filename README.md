# SeatBack
Solana Devnet event reservations, refundable SOL deposits, QR attendance and free waitlists.
Existing repository: https://github.com/0xalpar/seatback

## Status
Architecture and project skeleton only. React shell and API health endpoint run.
No deposit, wallet authentication, database integration, QR verification, worker or monetary
Anchor instruction is implemented. Never use real funds or deploy to Mainnet.

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
Later copy root .env.example to .env; the API skeleton does not auto-load it yet.
Use environment injection or add a deliberate env loader during backend implementation.

## Workspace
- apps/web: React + TypeScript + Vite; Claude owns frontend.
- apps/api: Node + TypeScript API; Codex owns backend.
- apps/worker: planned chain indexing, waitlist and outbox jobs.
- packages/contracts: shared wire types and reference policy arithmetic.
- packages/chain-client: generated IDL/client boundary (not generated yet).
- programs/seatback: Rust + Anchor non-monetary scaffold and proposed state.
- supabase/migrations: proposed PostgreSQL schema, not applied.
- docs: architecture, API, on-chain specification, security, tests, roadmap and Claude handoff.

## Collaboration
main is the shared reviewed baseline. backend and frontend start at the foundation commit.
Codex works on backend; Claude works on frontend. Open PRs into main. Never force-push main
or commit secrets. Pull main before integration. Coordinate changes to packages/contracts
and lockfiles; backend owns contract changes. See AGENTS.md and docs/frontend-task.md.

## Manual setup before integration
1. Authenticate git/gh separately on both computers; the Codex connector is not a local Git credential.
2. Provision a development Supabase project or local PostgreSQL. Apply migrations only to that DB.
   Configure service role server-side; direct browser table access is intentionally denied by RLS.
3. Install Rust, Solana CLI and Anchor 0.32.1 (WSL2 recommended on Windows). Toolchain compatibility
   and Anchor build/tests remain to be verified. Pin the working Solana/Rust versions after validation.
4. Generate dedicated development wallet/program keypairs outside Git. Replace placeholder declare_id,
   add programs.devnet to Anchor.toml, sync keys, generate IDL, then build/test locally before devnet deployment.
5. Fund only a dedicated Devnet wallet with faucet SOL. Configure independent dispute authority,
   gate worker signer, QR key and secure session secret. Never send private keys through chat.
6. Configure HTTPS origin, secure cookies, private event code hashing, scheduler and RPC health monitoring.
7. Implement and test all fund-handling invariants before enabling any deposit UI.

See docs/validation.md for actual executed checks and current limitations.
