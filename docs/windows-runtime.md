# Windows runtime setup (Task 2)

## Runtime installation

The original agent had no Docker/WSL runtime. On 2026-10-11 Docker Desktop was found installed,
and Microsoft-signed WSL 3.0.1 plus VirtualMachinePlatform were installed/enabled locally.
Ubuntu 24.04 and Docker Engine 29.8.2 / Compose 5.5.1 now run on this computer.
All four application images built locally. PostgreSQL 16, API, worker and web are healthy;
both migrations, 17 RLS application tables and immutability triggers were verified locally.
The browser renders the real empty events API at http://localhost:5173.
These are actual local runtime checks, separate from successful hosted CI.

In **Administrator PowerShell**, install WSL if it is absent:

```powershell
wsl --install --no-distribution
```

Restart Windows if requested, then run `wsl --update`. Install
[Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/),
start it, select the WSL 2 backend and Linux containers, and wait until its engine is running.
See [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).
Hardware virtualization must be enabled. No host PostgreSQL, Node or Solana installation is
required for Compose. Installation may require administrator approval; do not install inside CI.

## Prepare configuration without inventing deployment credentials

Run in **ordinary PowerShell** from your existing SeatBack checkout:

```powershell
git switch release/mvp
git pull --ff-only
docker version
docker compose version
if (!(Test-Path -LiteralPath .env)) { Copy-Item infra/docker/.env.example .env }
notepad .env
```

Compose v2.24+ and a running Linux engine are required. If `docker version` cannot contact
the server, start Docker Desktop before continuing. Preserve an existing `.env`; the root
host-run `.env.example` is different from the Docker template.

Fill in **existing** external secret file paths (Windows forward slashes), the gate keypair,
independent dispute authority public key, and the actual Devnet program ID matching the IDL.
The three application secret files must be distinct, randomly generated, at least 32 characters,
UTF-8 without BOM, and outside Git. Follow [secret setup](docker.md#first-time-setup); retain
existing secrets when reusing a database. Never paste a private key into `.env` or chat.
Mount the gate JSON read-only through `GATE_KEYPAIR_FILE`; do not mount the arbiter private key.

**On-chain readiness:** the checked-in IDL uses the locally generated dedicated public program
identity `5PZki4JDVr8Cd1DTCGCiRHNgXAnZBjAAJVc9HSrmCR97`. This does not prove deployment.
Faucet funding, deployment and test signing have operator approval, but the RPC faucet returned
429 (quota or depleted supply). Obtain Devnet-only faucet SOL for the dedicated deployer;
never send real SOL. Application health does not prove an executable program exists.

## Start and verify (once real configuration is available)

```powershell
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
docker compose exec db psql -U seatback -d seatback -c 'SELECT name,applied_at FROM seatback_migrations ORDER BY name'
Get-Content infra/docker/test/schema.sql | docker compose exec -T db psql -U seatback -d seatback
docker compose exec api node infra/docker/healthcheck.mjs api
docker compose exec worker node infra/docker/healthcheck.mjs worker
Invoke-RestMethod http://localhost:5173/health
Invoke-RestMethod http://localhost:5173/v1/events
Start-Process http://localhost:5173/events
```

Expect `db`, `api`, `worker`, `web` healthy and `migrate` exited with code 0, two migration
ledger rows, 17 RLS application tables, and API health `mode: backend`. The browser event page
must show API data or its empty state without a connection error. Browser requests use same-origin
`/v1`, never Docker hostnames. PostgreSQL 16 is internal with persistent `postgres-data` storage.
API/worker health does not prove on-chain execution or successful job settlement.

Stop with `docker compose down`; this retains the database. Restart using the same secrets and
`docker compose up -d --wait`. **Do not use `down -v` on data you want to retain.** Changing the
password file does not rotate an existing database password. Use the migration update procedure
in [Docker guidance](docker.md#development-migrations-and-persistence).

For failures, run `docker compose logs --tail=100 migrate api worker web`. Check missing files,
Docker Desktop path sharing, IDL equality and Devnet RPC availability. Do not share secret files
or an unredacted Compose configuration. Use `localhost` consistently with `WEB_ORIGIN`; rebuild
web after public configuration changes. Do not disable genesis or Mainnet rejection checks.

## Hosted validation and its limits

The `docker` workflow on `release/mvp` validates normal Compose configuration, builds all four
application targets, applies and reruns migrations against PostgreSQL 16, checks schema/RLS,
health and proxy networking, renders React in Chrome with its actual empty API response, and
recreates containers to verify persisted migration data and service recovery. It also tests
read-only gate mounting and rejection of Mainnet configuration and genesis.

Only the explicit CI override uses disposable, unfunded credentials and a synthetic HTTPS
genesis-only RPC fixture. It cannot execute chain instructions and is not a Devnet deployment.
Normal Compose retains external Devnet RPC and existing financial/security checks. CI success
does not establish local execution, deployed contracts, Phantom authentication or financial
end-to-end flows. See the workflow results on the current branch before treating checks as passed.
