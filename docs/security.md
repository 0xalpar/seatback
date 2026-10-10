# Security boundaries
Anchor escrow and custody rules are implemented and tested with the compiled SBF program.
No security audit is claimed. Live deployment and end-to-end verification must be recorded separately.
## Authentication
Use Sign-In With Solana style domain/origin-bound canonical message: wallet, domain, URI, devnet,
nonce, issued-at and expiration (5 minutes). Persist hashed one-use nonce. Verify Ed25519 signature and
exact message bytes server-side, then atomically consume nonce. Login is not a transaction.
Session: random 256-bit token, hash at rest, HTTP-only Secure SameSite=Lax cookie, 24h TTL,
rotation and logout revocation. Restrict CORS to configured WEB_ORIGIN and validate Origin on writes;
require CSRF token header. Enforce body size, rate limits, wallet ownership and resource authorization.
Supabase auth is not assumed to understand this custom session: API does all identity authorization.

## Private events
Code generated with >=128 bits of entropy or hashed with slow password KDF + server pepper if human-selected.
Store only hash; constant-time verify; rate-limit wallet/IP, expiry-bound admission record and no logging.
List/search excludes private events. Unknown/no-access private IDs both return 404. Do not expose code/hash
in DTOs, transactions, logs or frontend bundles. Gate signer co-signs register after access check.
Private access cannot hide public chain metadata. Do not store personal event text on-chain.

## QR
QR token opaque 256-bit random, short TTL 60 seconds; store SHA-256 digest only.
Bound to event, reservation, participant and single-use nonce. Never use static wallet QR as attendance proof.
Scanner authenticated as organizer or authorized event scanner; chain validates scanner PDA/revocation too.
Use a DB CAS/lease for scanner race, then build participant+scanner signed transaction; commit consumed only
after chain confirmation. Recover expired pending intent; chain reservation state prevents replay.
Do not expose a participant QR to another wallet or cache it. Camera permission denied/manual token fallback
must preserve authorization checks. Production attestation trust and QR sharing risk remain; co-signature
does not prove geographic location. Evidence uploads private, bounded, content-type validated and access logged.

## Financial
Checked u64 math, no JS floating point SOL calculations. Floor participant 30%, remainder organizer.
Immutable snapshot and authorities, canonical PDA seeds, event-wide unresolved dispute counter.
No organizer transfer until cancellation/dispute cutoff. Reject mainnet configuration at runtime.
Transaction builders validate program, recipient accounts, amount, cluster and intent signer; frontend
decodes before Phantom signature. RPC transactions, not submitted signatures alone, establish success.
Test malicious remaining accounts, duplicate account aliases, privilege escalation and reinitialization.
Dedicated devnet upgrade authority is still trusted: upgrades can change logic. Never claim immutable
production custody while upgradeable. Mainnet requires independent review and different operational controls.

## Data
Enable RLS on every public table with zero browser grants. Server credentials bypass RLS so API checks
are mandatory. Use parameterized SQL; redact secrets; log request IDs and signatures, not signed messages,
private codes, sessions, QR tokens or evidence. Avoid public storage buckets. Restrict DB and API origins.
