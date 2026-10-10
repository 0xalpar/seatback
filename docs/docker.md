# SeatBack with Docker Compose

This infrastructure branch starts from backend `f728f00`. It builds the frontend present in
the checkout; it does not bring Developer 2's integration branch into backend. Merge/cherry-pick
the infrastructure files into the reviewed integration branch to run its complete UI.
No frontend source, shared API contract, signing implementation or Anchor business logic changes.
The Anchor program is deployed separately to **Solana Devnet**. Compose contains no validator.

## First-time setup

Install Docker Desktop with Linux containers (WSL2 on Windows), or Docker Engine with Compose
v2.24+ and BuildKit. No host Node, pnpm, Rust or PostgreSQL is needed to build/run the containers.
Deploy/synchronize the actual Devnet program separately using docs/backend-integration.md.
The program ID must match the compiler-generated IDL included in the checkout. The foundation
test address is not evidence of deployment; do not substitute an invented address.

1. Create a private directory **outside this repository** for secrets. Use three independent,
   cryptographically random values of at least 32 characters, stored in separate UTF-8 files:
   database password, session secret and access-code pepper. For example, on a machine with Node:

   ```sh
   # Replace /absolute/private/seatback with your existing private directory.
   node -e 'const fs=require("node:fs"),c=require("node:crypto"),p=require("node:path");for(const n of ["postgres-password","session-secret","access-code-pepper"])fs.writeFileSync(p.join(process.argv[1],n),c.randomBytes(32).toString("hex"),{flag:"wx",mode:0o600})' /absolute/private/seatback
   ```

   Docker-only alternative: run the same Node command in `node:24.19.0-bookworm-slim` with that
   external directory mounted at `/secrets`; pass `/secrets` as its final argument. Files created
   by a root container may need ownership correction. Never overwrite existing database secrets.

2. Supply a dedicated **Devnet-only** gate keypair JSON file outside Git, with only faucet SOL
   for worker fees/rent. Participant escrow does not live in this wallet. Supply the independent
   arbiter's **public** address; keep its private key off these containers. See backend integration
   guidance for authority and deployment requirements. Do not paste keys or seed phrases into chat.

3. Copy `infra/docker/.env.example` to root `.env` and fill in the public IDs and absolute secret
   paths. Preserve any existing root `.env` separately first; this example is for Docker, whereas
   the root example is for host-run services. On Windows use `C:/Users/...` paths and Docker Desktop
   file sharing. Secret file bind mounts must be readable by UID 1000 (Node) and the PostgreSQL
   entrypoint. On Linux use an appropriate owner/ACL for UID 1000 while keeping the external
   directory private. Compose file-backed secrets do not reliably remap uid/gid/mode attributes.
   Do not solve permissions by committing keys or making a wallet broadly accessible.

4. Start from the repository root:

   ```sh
   docker compose config --quiet
   docker compose up --build
   # Or detached, waiting for health checks:
   docker compose up --build -d --wait --wait-timeout 180
   ```

Open **http://localhost:5173**. `/frontend-health` checks Nginx; `/health` proxies API liveness;
`/v1/events` exercises the API and database. The API is not separately published. PostgreSQL has
no host port. Do not point the browser at `http://api:3001` or `http://db:5432`.

## Services and startup

| Service | Behavior |
| --- | --- |
| `db` | PostgreSQL 16, SCRAM password auth, persistent `postgres-data` volume, private internal network |
| `migrate` | Runs the existing checksum/advisory-lock migration runner once, exits zero on success |
| `api` | Existing backend bootstrap and API server, container-only listen address `0.0.0.0:3001` |
| `worker` | Existing `BackendWorker.tick()` with the same two-second loop and a successful-tick heartbeat |
| `web` | Multi-stage Vite build served by non-root Nginx, SPA fallback, same-origin `/v1` reverse proxy |

API/worker wait for healthy PostgreSQL and successful migrations; web waits for healthy API.
Applications run non-root with read-only roots, temporary `/tmp`, dropped capabilities and
read-only runtime secret mounts. Only API/worker receive the gate keypair. It is never a build
argument, environment value, image layer or frontend asset. The arbiter key is never mounted.
The build context excludes environment files, private-key patterns, local dependencies/artifacts,
Git data and all directories outside the source allowlist.

`infra/docker/entrypoint.mjs` is a container lifecycle/transport adapter around `createBackend`.
It preserves configuration validation, program/IDL equality, exact Devnet genesis checking and
financial logic. `SOLANA_CLUSTER=devnet` and `ALLOW_LOCAL_VALIDATOR=false` are fixed in Compose.
Runtime secrets are read from files; the PostgreSQL URL is assembled with encoded credentials.
Startup errors are redacted. No unauthenticated readiness route is added to the application.

Container API health combines the existing `/health` with a database migration-ledger query.
Worker health requires the database and a successful tick in the last 45 seconds. A tick may
still contain handled per-job RPC retries: health does **not** establish on-chain finality,
offer delivery, program deployment or arbiter availability. Docker restart policies restart
exited processes; they do not automatically restart merely unhealthy processes. Monitor logs
and health separately. Backend bootstrap checks network identity, not deployed program bytecode.

## Configuration and frontend integration

| Setting in root `.env` | Meaning |
| --- | --- |
| `WEB_PORT` | Host loopback port, default 5173 |
| `WEB_ORIGIN` | Exact browser origin, default `http://localhost:5173`; change with the port |
| `SEATBACK_PROGRAM_ID` | Actual Devnet program public key matching generated IDL; required |
| `DISPUTE_AUTHORITY` | Fixed independent arbiter public key; required |
| `SOLANA_RPC_URL` | Server-only HTTPS Devnet RPC, may carry a private provider credential |
| `PUBLIC_SOLANA_RPC_URL` | Public browser-accessible HTTPS Devnet RPC; never private credentials |
| `GATE_KEYPAIR_FILE` | Absolute dedicated Devnet gate file path |
| `POSTGRES_PASSWORD_FILE` | Absolute password file path; at least 32 characters |
| `SESSION_SECRET_FILE`, `ACCESS_CODE_PEPPER_FILE` | Absolute distinct secret file paths; at least 32 characters |

Developer 2 must preserve these requirements when integrating:

- Browser API base is empty/current origin, with requests to `/v1/...`. The Dockerfile supplies
  both `VITE_API_BASE` (current frontend spelling) and `VITE_API_BASE_URL` (foundation example).
  Nginx forwards the original browser Origin, cookies and CSRF/idempotency headers. Existing
  auth/domain checks and `credentials: include` must remain. No CORS bypass is added.
- `VITE_DEMO_MODE=false` is baked into the web build. Retain real error/pending states; do not
  silently fall back to fixtures. This branch's foundation UI is not the integrated frontend.
- Network is Devnet. Program/public RPC values are build-time public configuration; rebuild web
  when they change. Changing runtime environment variables on Nginx does not reconfigure Vite.
- Keep the deployment IDL synchronized and retain all gate/participant/scanner signatures as
  documented in docs/backend-integration.md. No Node-only chain-client import into Vite.
- Only public values may be added as frontend build arguments. A provider credential embedded
  in a browser RPC URL is public to everyone who receives the bundle.

## Development, migrations and persistence

This is a local development **environment using production builds**, not a hot-reload server.
After code changes, run `docker compose up --build`. No host node_modules or key directory is
mounted into the source tree. Run existing project tests on the host (`pnpm check:foundation`,
`pnpm check`) or in CI; application images intentionally omit test/build tooling.

The default database bootstrap user `seatback` is the local PostgreSQL administrative owner,
so migrations and backend authorization work with default-deny RLS. This is **not** a browser
role. Production should provision a separate migration owner and narrowly scoped server role
with the required RLS-bypass/grants; never grant browser roles table access.

The existing migration runner validates checksums, serializes migrations and records their ledger.
For a schema update, stop writers, run migrations explicitly, then recreate services:

```sh
docker compose stop api worker web
docker compose build migrate api worker web
docker compose run --rm migrate
docker compose up -d --wait
docker compose exec db psql -U seatback -d seatback -c 'SELECT name,applied_at FROM seatback_migrations ORDER BY name'
```

Do not edit already-applied SQL or bypass checksum errors. `docker compose down` preserves the
database volume; `docker compose stop/start` preserves containers too. Changing the password file
does not rotate a password in an existing PostgreSQL volume. Rotate deliberately with SQL and
coordinated application configuration. Never run `down -v` against a database you need; that
deletes its data. Back up before migration and verify restores for any durable deployment.

## Production guidance

The checked-in Compose file is loopback-only local configuration. Keep the production image
targets; deploy under an HTTPS reverse proxy on a controlled host/orchestrator, using the actual
HTTPS `WEB_ORIGIN` so secure cookies remain enabled. Preserve `/v1` and Origin headers through
the outer proxy. Do not publish the database or gate key volume. Pin reviewed image digests,
scan images, apply resource limits, configure backups/TLS for managed PostgreSQL, protected
secret storage/rotation, log retention and monitoring. Restrict access to the Docker daemon.
Server RPC provider tokens belong in protected runtime configuration, never web build arguments.
This remains Devnet-only; Docker does not constitute a financial/security audit.

For a managed database, adapt the infrastructure connection builder/migration environment with
reviewed TLS settings; the local file intentionally assembles a private-network PostgreSQL URL.
Do not set `sslmode=disable` for a hosted database. Do not reuse local administrative DB credentials.

## Troubleshooting and verification

```sh
docker compose ps -a
docker compose logs --tail=100 migrate api worker web
docker compose exec api node infra/docker/healthcheck.mjs api
docker compose exec worker node infra/docker/healthcheck.mjs worker
docker compose exec db pg_isready -U seatback -d seatback
```

- Required-variable error: fill root `.env` with public IDs and existing external secret paths.
- Startup failed: check secret readability, database migrations, IDL/program equality and HTTPS
  Devnet RPC availability. Existing genesis checks reject Mainnet even if its URL says Devnet.
- Web 502/unhealthy dependency: API did not bootstrap or DB/migration failed. Check service logs.
- Login origin mismatch: use `localhost` consistently, update `WEB_ORIGIN` with `WEB_PORT`, and
  use same-origin `/v1`; do not mix localhost and 127.0.0.1 or internal service names.
- RPC rate limits/stale worker health: use an appropriate Devnet provider and inspect retry/dead
  job logs. Do not release deposits/holds based on timeouts. See backend reconciliation guidance.
- New image, old UI configuration: rebuild `web`; Vite settings are compiled into its bundle.
- Cannot read a secret on Windows: enable Docker Desktop path sharing; on Linux verify UID/ACL.

Validation: `node --test infra/docker/test/environment.test.mjs` tests secret loading/URL encoding.
The `docker` GitHub Actions workflow validates Compose, builds all application targets, starts
PostgreSQL 16, checks two migrations and idempotent rerun, API/worker health, SPA serving,
same-origin API connectivity, read-only key mounting, unpublished DB and API restart recovery.
It also rejects Mainnet cluster and genesis. Its HTTPS RPC is an explicit **genesis-only test
fixture** with disposable keys: no validator, funding, chain transactions or deployed program.
Normal Compose always uses the configured external HTTPS Devnet endpoint. A real Devnet/Phantom
end-to-end check remains required with Developer 2 and the actual deployment.

Official references: [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/),
[runtime secrets](https://docs.docker.com/compose/how-tos/use-secrets/),
[pnpm multi-stage builds](https://pnpm.io/docker).
