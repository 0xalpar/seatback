# Backend validation — 2026-10-10

## Executed checks
- Node 24.19.0, pnpm 11.25.0, TypeScript 5.9.3. Workspace strict type checks and production builds pass,
  including the unchanged frontend foundation. Foundation/OpenAPI/RLS inventory checks and git diff --check pass.
- 16 Node tests pass. Both SQL migrations execute against PGlite, an actual embedded PostgreSQL engine.
  Coverage includes constraints/RLS/immutable snapshots, wallet signatures/nonces/sessions,
  CSRF/origin/cookies, private discovery, concurrent queue scheduling, QR expiry/co-signing,
  partial transaction signatures/tampering, finalized projection slots, generated IDL encoding,
  outbox retry persistence and HTTP economic idempotency.
- Production dependency audit reports no known vulnerabilities after targeted TOML/UUID/stream-json
  overrides. Full workspace audit at moderate threshold passes; one existing LOW development
  advisory remains in Vite/esbuild. Frontend package versions/files were not edited.
- Hosted Ubuntu successfully generates Anchor IDL, compiles SBF with Agave 2.3.13/platform-tools v1.56
  and runs four Rust unit tests plus the compiled-SBF adversarial lifecycle test. Initial verified run:
  https://github.com/0xalpar/seatback/actions/runs/38058711357
  Lifecycle exercises escrow CPI/rent conservation, cancellation boundaries, payout/vault substitution,
  capacity/lifetime caps, gate/arbiter authorization, delegated/revoked scanners, missing participant
  signature, replay, dispute-wide settlement blocking, independent arbitration, cancellation refunds,
  offer holding/accept/expiry and finalized withdrawals. Additional tests/checks run in subsequent CI commits.
- Read-only live Devnet RPC query and actual ChainClient.assertNetwork pass. The full genesis hash,
  not the shortened wallet chain identifier, is verified. No funded account or deployment is created.

## Boundaries and required manual work
Rust/Anchor/Solana/PostgreSQL CLIs and Docker are absent on this Windows host; Rust/SBF checks run
on hosted Ubuntu. Node RPC tests use explicit doubles; embedded SQL tests do not replace tests against
the chosen live Supabase/PostgreSQL instance. No Phantom/browser integration or Devnet deployment
has been run. No security audit is claimed. Compiler cfg/deprecated SDK warnings are non-fatal.

Provision a disposable database, secrets and dedicated gate/arbiter/program wallets outside Git,
regenerate IDL for the deployment program public key, rerun checks, deploy only to Devnet with faucet
SOL and complete frontend/API/chain flows with Developer 2 before merging. See backend-integration.md.
Full historical indexing, notifications, governance/appeals and rent reclaim remain outside MVP.

Publication uses the authorized GitHub Git-data connector on backend with expected-head checks,
preserving the foundation history. Connector authorization does not configure local git/gh credentials.
No apps/web or shared wire DTO/OpenAPI file is changed; no Mainnet use, secrets or private keys committed.
