# Foundation validation — 2026-10-10
## Passed locally
Runtime Node v24.19.0; pnpm v11.25.0; TypeScript 5.9.3; React 19.1.1; Vite 7.3.5.
- pnpm install --frozen-lockfile passed before the Vite update; subsequent pnpm install updated the committed lockfile.
- node scripts/check-foundation.mjs: documentation inventory, OpenAPI refs/path parameters,
  16-table RLS inventory and Devnet configuration checks passed. This is not a SQL execution test.
- pnpm check: strict typechecks for contracts/API/web/worker passed.
- Five node:test cases passed: fail-closed HTTP routes, refund boundaries/conservation, u64 validation,
  deadline validation and dispute/withdrawal timing.
- API/contracts TypeScript compilation and React production build passed.
- pnpm audit --audit-level moderate passed after updating Vite 7.1.7 -> 7.3.5.
  One LOW advisory remains in Vite's esbuild 0.27.7 dependency:
  https://github.com/advisories/GHSA-g7r4-m6w7-qqqr
  Patched esbuild >=0.28.1 is outside Vite's declared range. Review compatible Vite upgrade before
  exposing development servers; this scaffold binds Vite/API to localhost and does not use esbuild's server.

## Not run / incomplete
Rust/cargo, Anchor, Solana CLI, psql and Docker were unavailable in this environment.
No Anchor compilation, local-validator test, SQL migration execution, database RLS integration test,
Phantom/browser interaction test, API business integration test or Devnet deployment was performed.
No generated IDL/program address or escrow logic exists. API business routes return 501.
No Supabase project, scheduler, secrets, development wallets or authority selection has been provisioned.
CI is configured but a successful hosted run must be checked after push.

## Git transport
The GitHub connector authenticates as 0xalpar and reports admin/push access to private 0xalpar/seatback.
Local git credential-manager has no usable noninteractive GitHub credential.
Repository publication uses the authorized GitHub Git-data API, preserving the original commit as parent.
This local directory is a prepared source snapshot, not an authenticated Git CLI clone.
On both developer computers authenticate Git separately and clone the existing repository.
Do not mistake connector authorization for shell git/gh authorization.

## Manual integration checklist
See README.md manual setup and docs/testing.md required gates. Fix the remaining dependency advisory
with a tested compatible update; validate Anchor/Rust/Solana version combination; apply the schema in
a disposable DB; configure independent arbiter and gate keys; implement/test custody before enabling UI.
All future chain activity stays on local validator or Devnet, using dedicated faucet-funded wallets.
