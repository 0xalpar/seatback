# Real local Solana demo

This environment executes the actual compiled SeatBack SBF program on Agave 2.3.13. It is not
public Devnet and does not use mocked RPC responses. Program loading at validator genesis is
not a public deployment transaction. The Devnet deployment remains unfunded/unverified.

## Windows startup

Docker Desktop's Linux engine, the existing ignored root `.env`, external secret files and
a compiled/tested `seatback.so` are required. This computer already has these prerequisites.
From the repository root in PowerShell:

```powershell
git switch release/mvp
git pull --ff-only
./scripts/start-local-demo.ps1
docker compose -p seatback-local -f compose.yaml -f compose.local.yaml ps -a
Invoke-RestMethod http://localhost:5174/health
Invoke-RestMethod http://localhost:5174/v1/events
Start-Process http://localhost:5174
```

On another machine, build/test the program first using the pinned Linux toolchain, then provide
`./scripts/start-local-demo.ps1 -SbfPath ./target/deploy/seatback.so`. The script prepares an ignored
local cache, downloads the official pinned Agave archive only if absent, verifies its published
SHA256, builds the validator image and starts the environment. It does not generate keys or
request public faucet funds. Preserve existing local keys and database secrets.

The local project uses separate PostgreSQL and ledger volumes. Web is localhost:5174;
RPC is 127.0.0.1:8899 and WebSocket 127.0.0.1:8900. PostgreSQL is unpublished. Both application
services share the validator network namespace so the existing explicit local-validator
configuration still uses a **loopback** RPC URL. Remote HTTP/local-validator overrides remain
rejected. The ordinary `compose.yaml` still selects Devnet with the override disabled.

The local web build displays a permanent **Local Solana validator** banner. The API's legacy
intent `cluster: devnet` is retained for shared-interface compatibility; it is not proof of the
actual network. The test runner independently rejects public Devnet/Mainnet genesis and uses
only the fixed loopback endpoint. Never show local signatures as Devnet Explorer transactions.

## Signed API rehearsal

For a deterministic presentation without a browser wallet, run the commands below in a terminal
beside localhost:5174. The runner creates fresh capacity-1, 0.01 local SOL events and dedicated-role
sessions, prints each actual finalized signature, waits for the real check-in opening, and exits 0
only after refunds, database synchronization and negative/security assertions pass. Allow several
minutes for finality and check-in. Show the resulting events in Explore and the public proof file;
do not describe this automated signing as a Phantom demo. Private invitation codes remain hidden.
See [the verification record](local-verification.md) for the exact tested scope.

```powershell
pnpm check:foundation
pnpm check
node scripts/local-validator-smoke.mjs C:\Users\Mustafa\.seatback\devnet
```

The test uses existing dedicated local test-role keys outside Git, obtains **local-validator**
test SOL, signs login messages and real API-prepared transactions, waits for finalized receipts,
and compares PostgreSQL projections to actual reservation/vault accounts. It never prints
private keys, cookies, invitation codes or QR tokens. Public proof is written under ignored
`.cache/local-results.json` only after successful completion. Repeated runs create fresh events.

The rehearsal covers capacity/organizer rejection, registration/escrow conservation, 100% early
cancellation, the worker's free waitlist/seat offer, offer acceptance, event cancellation refund,
scanner plus participant attendance signing, full attendance refund and replay rejection.
Private invitation access is checked without leaking event metadata into public discovery.
The capacity negative case deliberately broadcasts an expected-to-fail transaction only to
the fixed local RPC, with local preflight skipped, and requires finalized program rejection.
Production API transaction preflight/validation is unchanged; an intent is not a reserved seat.

Test wallet signing is automated Node signing, **not Phantom interaction**. The Codex in-app
browser has no Phantom extension. Browser checks verify React rendering, API-derived events,
event details/search and the explicit local label; they do not establish a Phantom rehearsal.

## Time-dependent financial rules

The RPC validator uses its real clock. Do not change host time or production financial rules.
The compiled-SBF `tools/chain-tests` harness supports a controlled `Clock` sysvar and executes
actual program bytecode/system CPI for exact deadline boundaries, 30/70 and late cancellation,
offer expiry/replacement, scanner authorization/co-signing, duplicate refunds, 24-hour dispute
cutoff, unresolved-dispute withdrawal blocking and eligible settlement.

In the prepared WSL checkout:

```bash
source "$HOME/.cargo/env"
cd "$HOME/seatback"
SBF_OUT_DIR="$PWD/target/deploy" cargo test --locked -p seatback -p seatback-chain-tests -- --nocapture
```

These are controlled-time SBF harness tests, not 24 hours elapsed on the RPC validator.

## Presentation and tomorrow's Devnet switch

For tonight, open localhost:5174 and show the local banner, real API events and the finalized
local transaction/account proof from the rehearsal. Financial workflows require a supported
wallet provider; automated signing proof is separate from an interactive Phantom demonstration.
Use [the live demo sequence](demo-runbook.md) with accounts/times prepared for your presentation.

Tomorrow fund only the dedicated Devnet deployer with faucet SOL, then follow
[the deployment guide](devnet-deployment.md). About 4.94 test SOL is needed at the upload peak
for this 485,528-byte program; allow about 5.2 SOL including fees. Buffer rent returns after
successful deployment. Program ID/IDL are already synchronized, but actual deployment must
pass `scripts/verify-devnet.mjs` before claiming Devnet readiness.

Start the ordinary Devnet environment with `docker compose up --build -d --wait` and open
localhost:5173 in a Phantom-enabled browser. Never apply the local override to the Devnet demo.
Gate/test accounts need separate faucet-only funds. Rehearse finalized deposits, cancellation,
waitlist replacement and QR co-sign/refund with real Phantom approvals.

Both projects preserve volumes on ordinary `down`. Do not use `down -v` unless you explicitly
intend to discard local test ledger and matching database data together. Resetting only one
creates inconsistent chain/database history.
