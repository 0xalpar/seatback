# Backend MVP integration handoff

## Developer 2 compatibility
Existing packages/contracts/src/index.ts and docs/openapi.json remain unchanged. All v1 routes,
including participant attendance polling, are implemented. No apps/web file is modified.
Backend owns the root dependency/lockfile additions; preserve them when integrating frontend.
Use the existing DTOs: decimal lamport strings, Unix seconds, UUID identifiers.
Set credentials: include, the configured Origin, CSRF on authenticated writes, and a UUID
Idempotency-Key for economic intent creation. Reuse the key for identical request retries.
Never replace real errors with fixture success. Pending is not a completed deposit/refund.

The chain-client root entry uses Node filesystem/crypto and is server-only. Frontend should use
the compiler-generated JSON IDL with its wallet/web3 stack to inspect transactions; do not import
the Node entry into Vite. Retain gate signatures when signing the immutable legacy transaction.
Submit to POST /v1/transactions/submit; poll until finalized projection reports confirmed.
Attendance requires scanner AND participant approval on the same message. Scanner initiates and
signs; participant polls /v1/me/attendance-intents and signs. Either signing order works. Receipt
signature is null until all required signatures are present. Request a new intent on expiration;
never alter the message/blockhash of a signed intent.

UX boundaries: one lifetime registration per event/wallet; cancellations still count toward the
lifetime limit. Fixed arbiter cannot participate/scan. Deposit refunds exclude account rent and
network fees. Organizer allocation stays in escrow until max(eventEndsAt, checkInClosesAt+86400)
and all event disputes resolve. Withdrawal is per registration. Event cancellation makes remaining
deposits claimable; it is not a mass payout. Poll waitlist views for finalized active offers.
Leaving an offered entry stops participation; the chain hold releases at expiry. Closed/expired
entries cannot rejoin in v1. No notification service is configured.

## Setup
1. Use PostgreSQL 15+ or development Supabase. Supply a server-only PostgreSQL connection URL
   with TLS for hosted databases. This API connects through pg; it does not need a Supabase HTTP
   service-role key. Browser RLS stays default-deny.
2. Copy root .env.example to .env. Set DATABASE_URL, two distinct random secrets of at least 32
   characters (SESSION_SECRET, ACCESS_CODE_PEPPER), WEB_ORIGIN, SEATBACK_PROGRAM_ID,
   SOLANA_RPC_URL, DISPUTE_AUTHORITY and GATE_KEYPAIR_PATH. Auth domain derives from WEB_ORIGIN.
3. Generate a dedicated Devnet gate keypair outside Git and provide only its absolute file path.
   Give it faucet SOL for worker fees/rent. Participant deposits never enter this wallet. The fixed
   arbiter is a separate wallet. Never upload keypairs/seed phrases to GitHub or chat.
4. Run pnpm db:migrate on a disposable development DB first. Migration checksums, advisory lock,
   schema and ledger commit together. Foundation migration now uses built-in gen_random_uuid
   instead of unused pgcrypto. If already tracked in another migration system, baseline carefully;
   do not reset live data. Tests apply both migrations to embedded PostgreSQL.
5. Run pnpm dev:api and, separately, pnpm dev:worker. Scripts load root .env. API binds localhost:3001.
   Bootstrap verifies Devnet genesis. A local validator needs ALLOW_LOCAL_VALIDATOR=true and
   a loopback RPC URL; remote endpoints cannot use this override. Mainnet genesis is rejected.
6. Frontend must use the same network/program ID. Use HTTPS + secure cookies outside localhost,
   with a reverse proxy to the API. Health is process liveness, not a deployment audit.

## Build and deployment prerequisites
Rust 1.89.0, Agave 2.3.13, platform tools v1.56; Anchor CLI 0.32.1 if using Anchor commands.
Use Linux/WSL2 on this Windows machine. No program keypair is committed and no deployment is claimed.

```sh
RUSTC_BOOTSTRAP=1 RUSTUP_TOOLCHAIN=1.89.0 cargo run --locked -p seatback-idl-gen
cargo build-sbf --manifest-path programs/seatback/Cargo.toml --tools-version v1.56 --arch v0 -- --locked
SBF_OUT_DIR="$PWD/target/deploy" cargo test --locked -p seatback -p seatback-chain-tests -- --nocapture
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm check
```

Published Anchor IDL builder forces procmacro2_semver_exempt; the compiler compatibility flag is
scoped to IDL generation only. SBF builds use the normal toolchain. IDL comes from compilation,
never handwriting. Before Devnet deployment generate a program key outside Git, update public
declare_id/Anchor Devnet configuration, regenerate IDL, rebuild and rerun checks. Verify public IDs
match before deploying with a dedicated faucet-funded Devnet wallet. Tests perform no network funding.

## Reliability boundaries
Database state never authorizes funds. Only successful finalized transactions matching the exact
approved message confirm an intent. Related chain accounts are read in one finalized slot context;
projection slots prevent older workers regressing events, registrations or disputes. Signatures
persist before broadcast; ambiguous timeout stays pending and retries resend identical bytes.
Bounded recent event history recovers approved wallet-direct broadcasts. High event throughput or
extended RPC history loss needs operator backfill; this is not a full indexer of actions never prepared
by the API. Financial rules remain on-chain even when projections lag.
HTTP idempotency claims also fail closed after a process crash; an operator must reconcile a stuck
REQUEST_IN_PROGRESS key against its persisted intent before releasing it. Never assume a timeout failed.

Outbox leases/event locks serialize scheduling; chain capacity rejects remaining races. Gate is trusted
for FIFO/private admission, not custody. Dead jobs log IDs and require operator reconciliation;
never release a possible chain hold by assuming timeout failed. Raw QR tokens/access codes are not
stored or logged. QR expiry is checked at scan initiation; a signed transaction may land until its
blockhash expires, only within the on-chain check-in window. Arbiter disappearance leaves disputed
funds locked. Evidence is private to participant/assigned arbiter.

No audit, appeals/governance, notification service, automatic rent reclaim or full historical indexer
is claimed. Manual Phantom + live development PostgreSQL + validator/Devnet integration with
Developer 2 is required before merging or enabling live deposits.
