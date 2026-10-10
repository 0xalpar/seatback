# Testing guidelines
## Automated checks
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm check
pnpm check runs strict TypeScript checks, PostgreSQL/API/transaction tests and all production builds.
tests/backend.test.mjs applies both migrations to PGlite (an embedded actual PostgreSQL engine),
then tests RLS, immutable terms/snapshots, money constraints, Ed25519 login/replay/expiry,
HTTP cookie/CSRF/origin behavior, private discovery, FIFO scheduling, QR leases/co-signing,
intent tampering/partial signatures/ambiguous broadcast, finalized projections/stale slots and real IDL encoding.
CI runs the same suite against PostgreSQL 16 with the pg driver as well. TEST_DATABASE_URL selects
that mode; fixtures create/drop only randomized test schemas and roles, never reset public schema.
RPC responses in Node tests are explicit test doubles; they do not establish smart-contract execution.
See docs/backend-integration.md for compiled SBF test commands. tools/chain-tests executes the actual
SBF program in solana-program-test, including system-program CPI. Reference policy tests are separate.

## Required before enabling financial UI
Anchor local-validator integration tests:
- signers/PDA/event relations and account alias attacks on every transfer instruction;
- exact rule1/rule2 boundary seconds, 1 lamport/odd deposit rounding and u64 overflow;
- simultaneous registration at capacity=1, lifetime cap, one wallet lifetime registration;
- forged admission, unauthorized/revoked scanner, missing participant co-sign, QR replay;
- snapshot immutability; locked metadata/times/deposit/authorities/capacity;
- no-show created lazily and explicitly; dispute opens at closes, fails at closes+86400;
- withdrawal fails before cutoff and event-wide while ANY dispute unresolved;
- independent arbiter required, double resolve rejected, disappearance leaves funds locked;
- event cancellation after partial refund, attendance, no-show and open dispute refunds remaining
  amount exactly once; cancellation after cutoff rejected;
- waitlist offer holds capacity and lifetime cap, expiration/accept race, wrong wallet,
  permissionless expire, duplicate accept/expire, event cancellation invalidates offers;
- funds conservation after each transition: vault spendable = deposit - participant paid - organizer paid;
  rent never paid as a deposit; total payouts <= deposit; no hidden close/realloc transfer.

Database/API integration:
Run migrations against disposable Postgres/Supabase and verify RLS with real deployed database roles.
gen_random_uuid is built into supported PostgreSQL; no pgcrypto extension is needed.
Test as anon/authenticated roles (zero access), API organizer/participant/scanner/arbiter authorization,
private search leakage, nonce/session expiry/replay, CSRF, CORS, code brute force, parameterized search.
Run two workers for same queue vacancy; simulate RPC timeout/reorg/crash between SQL and chain, retries/outbox.
Verify idempotency key reused with different payload fails; identical replay returns existing intent.
Test intent message tamper, wrong program/network/signer/recipient/amount, partial signature mismatch,
RPC success with program failure, unknown signatures, confirmed -> finalized reconciliation.

Frontend:
Use component tests for amount/time presentation and accessible errors; browser tests for wallet rejection,
network unavailable, expired offer, QR camera denial/replay, session expiration, private code, filter/pagination,
participant attendance co-sign and pending/failed/confirmed states. Use mocks explicitly labeled.
Real Phantom manual smoke checks on separate participant, organizer, scanner and arbiter wallets.
Test keyboard focus, labels, small screens and 24h UTC countdown. Avoid snapshot-only tests.

No security audit is claimed. Record commands, versions, actual failures and tool limitations in each PR.
