# Public runtime

The existing Sites frontend can use a same-origin Worker proxy to the Railway API.
Never tunnel the local validator or publish local-validator transaction controls.

## Railway

Project: `2844b672-a092-4ef9-8d3d-105e035c3924`.
API: `https://api-production-97a8.up.railway.app`.
Services: `Postgres`, `api`, `worker`. The provisioned hosted database uses PostgreSQL 18
with a persistent volume; local Compose retains PostgreSQL 16. Both use the same migrations.

Set `RAILWAY_DOCKERFILE_PATH=infra/docker/backend.Dockerfile`,
`SEATBACK_SERVICE=api` or `worker`, and `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
Set `WEB_ORIGIN` to the frontend HTTPS origin, `SOLANA_CLUSTER=devnet`,
`SOLANA_RPC_URL=https://api.devnet.solana.com`, `ALLOW_LOCAL_VALIDATOR=false`,
`SEATBACK_PROGRAM_ID` from `deployment/devnet.json`, and `DISPUTE_AUTHORITY`
from the dedicated independent Devnet arbiter's public address.
`SESSION_SECRET`, `ACCESS_CODE_PEPPER`, and `GATE_KEYPAIR_JSON` are protected runtime
configuration; never build arguments or source files. Only the gate key belongs on the
server. Deployer, program and participant keys stay on the operator's machine.

The hosted entrypoint materializes the gate in a private ephemeral file and runs
checksum-verified advisory-lock migrations before starting either service.
API readiness is `/health`; worker readiness uses its heartbeat healthcheck.
Database credentials and SQL ports must not be published to browsers.

Upload from a native Linux filesystem, not a Windows-mounted source path: Railway's
build context transport can otherwise reject `exclude-patterns` metadata.
Copy only Git source files, excluding ignored credentials, caches and keypairs.

## Sites publication

Run `node scripts/build-public-live.mjs` with `SEATBACK_DEPLOYED_ELF` pointing to the
compiled binary. It independently verifies the actual Devnet executable, bytecode,
authority and deployment transaction before building the live UI. It does not deploy.
The ignored `.cache/public-live-site` output is a Worker ESM artifact with inline assets.
Use the Sites source/publishing workflow, retaining the existing project ID and audience.
Set the Sites runtime variable `SEATBACK_BACKEND_ORIGIN` to the Railway HTTPS API.
The proxy preserves cookies, Origin and CSRF; it never fabricates successful transactions.

## Real Devnet smoke test

After deployment verification and explicit role funding, run:

```powershell
$env:SEATBACK_APPROVE_DEVNET_TESTS='yes'
$env:SEATBACK_TEST_BASE='https://seatback.alpar-dikkatli37347.chatgpt.site'
node scripts/devnet-smoke.mjs "$HOME/.seatback/devnet"
```

This signs with dedicated local test roles and records real finalized signatures in
ignored `.cache/devnet-results.json`. It does not fund wallets or use a mock RPC.
Actual Phantom/Solflare extension approval remains a separate browser verification.
Controlled SBF clock tests are separate from a real 24-hour Devnet dispute workflow.

Before presenting: confirm public `/health`, event loading, real wallet login and a
small deposit/refund. Preserve failures as failures. If deployment is pending, retain
the clearly labelled read-only public site and demonstrate local transactions separately.
