# Task 1: consolidated code baseline

`release/mvp` starts from `integration/frontend-backend` at `359442f6cfeaec2f2f41d854fa3f68a12d91e788`.
That branch already contains frontend `c9e4f8b` and backend `f728f00` through merge `35a2a8d`.
Only the infrastructure diff `f728f00..270c5ec` was applied from `infra/docker`; backend commits
were not merged a second time. All existing branches and PRs are retained; main is unchanged.

Consolidated modules: React/Phantom frontend, API/authentication/QR, background worker,
PostgreSQL migrations, generated chain IDL/client, Anchor escrow contracts and Docker services.
The backend, Anchor, database migrations and shared wire contracts remain byte-for-byte identical
to the integration baseline. No new product features, monetary rules or deployment are included.

## Integration fixes

- Shared frontend configuration resolves canonical `VITE_PROGRAM_ID` and `VITE_API_BASE` for
  both API requests and transaction submission. Legacy `VITE_SEATBACK_PROGRAM_ID` and
  `VITE_API_BASE_URL` remain supported. Conflicting aliases fail closed; an empty API base
  deliberately selects the browser origin. Existing Devnet/IDL/signer checks remain in place.
- Compose passes both program-ID names from `SEATBACK_PROGRAM_ID` and both API-base names as
  empty strings. The generated IDL is available during the frontend image build.
- The web environment example matches the implementation. Docker settings remain build-time
  public configuration; no backend secrets or gate keypair are included in frontend images.
- Root `pnpm check` now includes the existing frontend tests and infrastructure secret-loading
  test in addition to backend/contracts tests. Release-branch CI runs Node, PostgreSQL 16,
  locked Rust/SBF and Docker validation. Configuration regression tests cover alias conflicts
  and Compose's frontend/backend program-ID alignment.

## Validation commands and boundaries

```sh
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm check
docker compose config --quiet
```

Docker configuration validation requires the external secret paths and public-ID settings in
`infra/docker/.env.example`. Local Docker/Rust/Anchor/Solana tools are unavailable on the Windows
host; hosted CI provides Docker Compose/image smoke checks and compiled-SBF contract tests.
See the release PR's checks for actual results, rather than assuming tooling ran locally.

Docker smoke tests use disposable unfunded keys and an explicit HTTPS genesis-only RPC fixture.
They validate wiring/migrations/health/serving and Mainnet rejection, not live Solana execution.
The checked-in program ID remains the compilation/test placeholder. No new address, keypair,
deployment, funding or live Devnet/Phantom test is performed in Task 1.

Before real startup in a later task: install Docker if needed, supply actual external secret
files, configure the separately deployed Devnet program and regenerate matching IDL, then set
the frontend/backend program IDs consistently. See docs/docker.md. This task stops at the
reviewable consolidated code branch; it does not merge or close existing PRs.
