# SeatBack live demo

## Actual state and prerequisites

Use `release/mvp`. The local program identity is
`5PZki4JDVr8Cd1DTCGCiRHNgXAnZBjAAJVc9HSrmCR97`. This is a real local keypair's PUBLIC address,
**not proof that the program is deployed**. Require successful `scripts/verify-devnet.mjs` output
before enabling a live demonstration. CI RPC fixtures are never a substitute for Devnet.

Local secrets/Devnet-only keypairs are held outside Git at `C:/Users/Mustafa/.seatback/devnet`,
with owner/SYSTEM-only Windows directory ACLs. The ignored root `.env` stores only their file paths
and public configuration. Preserve these files; do not generate replacement identities on another PC.
Never mount the deployer, buffer, arbiter or participant keys into API/web containers; only gate is mounted.
Do not import generated test-role keys into Phantom by displaying their private bytes in a terminal.
Use separate Phantom Devnet accounts you control for interactive demonstrations.

## Startup and honest readiness

Start Docker Desktop's Linux engine after WSL is installed and any required Windows restart.
From repository-root PowerShell:

```powershell
docker version
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
Invoke-RestMethod http://localhost:5173/health
Invoke-RestMethod http://localhost:5173/v1/events
docker compose exec api node infra/docker/healthcheck.mjs api
docker compose exec worker node infra/docker/healthcheck.mjs worker
Start-Process http://localhost:5173/
```

Expect db/api/worker/web healthy and migrate exited 0. PostgreSQL 16 has no host port and uses the
persistent named volume. `docker compose down` preserves data; never use `down -v` on presentation data.
API health proves process/database operation, not deployed contracts, funded gate or wallet access.
An empty event list is expected before a real event is created. No sample chain success is seeded.

Keep the current compiler IDL and public ID synchronized with the confirmed deployment. Rebuild web
after ID changes. Run `node --env-file-if-exists=.env scripts/check-program-id.mjs --environment`.
Use the [deployment guide](devnet-deployment.md) for compiler generation, SBF tests, faucet rent
estimates and explicit local deployment signing. Funding/signing require operator approval.

## Presentation sequence

Prepare separate organizer, participant A and replacement participant B browser profiles, each with
Phantom set to Devnet and faucet-only SOL for network fees, account rent and a small test deposit.
The runtime gate needs faucet SOL for waitlist offers/expiry transactions. The arbiter must be distinct.
Connect and separately sign the login message in each profile. Do not call a message signature a deposit.

1. Organizer creates a public event with capacity **1**, lifetime registration limit **3** and deposit
   **0.01 Devnet SOL**. Set explicit local schedule fields: rule1 < rule2 <= check-in opens <= starts <
   check-in closes <= ends. All cancellation deadlines must be future at creation. Terms become immutable
   at first registration. Keep the presentation clock visible; never change registered terms to accelerate it.
2. Participant A reserves and approves Phantom's real transaction. Wait for finalized confirmation,
   then show the reservation and program-owned escrow. Preserve its actual transaction link.
3. Participant B joins the free waitlist while capacity is full. There is no deposit/signature for joining.
4. A cancels **before rule1** and approves the transaction. Show the 100% deposit refund; rent and network
   fees are separate. Wait for finality and worker projection; never announce success from a signature alone.
5. B's dashboard receives the time-limited seat offer. B reviews its expiry, accepts in Phantom and deposits
   SOL. This is a new signed transaction, not an automatic debit. The held seat cannot be stolen by fresh signups.
6. During the real check-in window, B generates the 60-second QR. The organizer/authorized scanner opens
   the scanner page and scans or privately pastes the token. Scanner approves its transaction signature.
   B opens **My seats**, reviews the pending attendance intent and co-signs in Phantom. Wait for finalized
   attendance and the 100% deposit refund; scanning alone is not attendance confirmation.
7. Show registration status and the actual Devnet Explorer transaction with `?cluster=devnet`.

For a short slot, use two prearranged events: an early-cancellation/waitlist event with check-in later,
and an already-registered event whose check-in window overlaps the presentation. A single new event
cannot demonstrate every deadline instantly. Build the presentation around actual future times.

For a 30/70 or late cancellation example, use a separate prearranged event and wait for its real deadlines.
The 70%/100% organizer allocation stays in escrow; it is not an immediate withdrawal. Organizer settlement
is blocked until max(event end, check-in close + **24 hours**) and while any dispute is unresolved.
Show blocked withdrawal and compiled SBF test evidence during the presentation; do not shorten the window.
Actual settlement needs a suitably aged, undisputed event and its own finalized transaction.

Private-event demo: organizer shares the event URL and code privately; the event is absent from public
search. A signed-in participant enters the invitation code on the private/unknown event access panel.
Unknown and unauthorized events have the same response. Never show the code or QR in public recordings.
Event cancellation makes remaining participant funds claimable through their **Claim refund** action.

## Failure handling and fallback

- Wallet rejection: retry only after checking the prior intent/receipt. Pending is not failure or success.
- RPC unavailable/rate-limited: pause the financial demo. Do not switch to Mainnet or synthetic RPC.
- Gate unfunded: seat offers cannot be created; fund only the dedicated public Devnet gate with approval.
- QR expires: request a new token. Existing scanner/participant signatures are preserved; do not edit a signed message.
- Docker or Windows restart required: save work, restart manually, open Docker Desktop, then run startup commands.
- If live prerequisites cannot be met, explicitly say **read-only UI preview / no Devnet transactions**.
  Existing fixture mode is opt-in and read-only; never present its example records as real reservations.

Before judges arrive, run `pnpm check:foundation`, `pnpm check`, container health checks and independent
Devnet verification; rehearse the live flow using your presentation profiles. CI success and unit tests
do not establish a completed Phantom rehearsal.
