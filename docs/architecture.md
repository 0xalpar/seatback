# Architecture v1
## Scope and trust
Phantom users need Devnet SOL for deposits and transaction fees; waitlist joining is free
and does not require a SOL balance. This limits the initial demo to wallet-capable participants.
Public/private refers to discovery and API metadata: Solana accounts and transactions are public.
Private access codes do not hide on-chain event identifiers or wallets.

React calls Node API with wallet-authenticated HTTP-only sessions. Node uses PostgreSQL/Supabase
as a private application database. Browsers do not receive the service-role key and do not query
tables directly. API prepares unsigned transactions; Phantom signs; API or client broadcasts;
a worker verifies confirmed transactions and projects chain state into DB. No API call can
substitute for the participant signature for deposits/cancellation/refunds.

Anchor is authoritative for capacity, policy snapshot, deposit escrow, seat offers, cancellation
splits, attendance outcome, disputes and settlement. DB is authoritative for text metadata,
code hashes, search indexes, login nonces, QR challenges and ordered free waitlist entries.
Participant funds live in per-reservation program-owned SOL vault PDAs, never backend wallets.
Rent and transaction fees are separate from refundable deposits and must be shown in UI.

## Lifecycle and invariants
Event: draft -> open -> closed OR cancelled. Publish only after verified create_event transaction.
Material terms (times, deposit, capacity, registration cap, authorities and metadata hash) lock at
first reservation. Even if later policy editing is added, existing reservation snapshots govern.
Current v1 allows metadata edits only before first reservation; no schedule changes after registration.
Event cancellation is allowed until settlement cutoff; after cutoff the event is finalized and cannot
be cancelled. This restriction avoids promising refunds after funds have left escrow.

Reservation: reserved -> attended | cancelled | no_show; no_show -> disputed; terminal settlement
records exact participant/organizer amounts paid. Preserve cancelled/settled tombstones to prevent
duplicate wallet reservations and replay. One lifetime registration per event/wallet in v1.
registration_limit is a lifetime successful registration cap, distinct from concurrent seat capacity.
Cancelled registrations release occupancy but still count toward that cap; offers must not exceed it.
Waitlisted entries and expired offers do not increment successful registrations.

Cancellation before rule1: 100% participant; at rule1 through strictly before rule2: floor(30%) participant;
at/after rule2: 0% participant. Organizer receives exact remainder; no lost lamports.
Require rule1 < rule2 <= check-in opens <= event start < check-in closes <= event end.
Cancellation allowed before check-in closes, only for reserved seats.
Attendance in [opens, closes) yields 100% participant refund.
No-show is determinable at closes. Disputes open in [closes, closes+86400), independent of worker timing.
Withdrawal allowed at max(event end, closes+86400), with event-wide unresolved dispute count zero.
Allocation is an entitlement still in escrow, not immediate organizer transfer.

For event cancellation, every registration receives remaining deposit:
deposit - participant_paid (including previously partially refunded cancelled reservations).
Clear organizer entitlement and forbid organizer withdrawal. Refund via permissionless per-reservation
claim to the recorded participant, not a loop over all wallets; show claimable vs paid explicitly.
Successful attendance and early full cancellation can pay participants immediately because their
entitlement cannot decrease. Other organizer allocations stay locked until event finalization.
Unresolved disputes cannot be bypassed by classifying reservations differently or closing accounts.

## Dispute decision (explicit hackathon trust assumption)
An independent named arbiter wallet is fixed per event before first registration, distinct from organizer
and gate authority. Participant files evidence hash on-chain during 24h window; evidence stays private in DB.
Only this arbiter may decide attendance refund vs organizer no-show allocation, with on-chain instruction.
There is no automatic timeout forfeiture for unresolved disputes; funds remain locked until resolution.
If the arbiter disappears settlement can stall. Production governance/appeals are out of scope.
Organizer/scanner attestation verifies the application's attendance process, not physical presence cryptographically.
A dishonest organizer can refuse scans; disputes are the recovery mechanism.

## Waitlist protocol
FIFO by (created_at, id), one active entry per wallet/event. Free join uses auth and private event gate.
After a confirmed cancellation, worker locks event and next queue rows in a DB transaction.
Create a pending offer/outbox job; submit create_seat_offer signed by gate authority.
Offer becomes visible/active only on chain confirmation; DB alone cannot reserve capacity.
On-chain offer reserves a seat, expires after configured 15 minutes (max 1 hour, before check-in opens),
and binds event/wallet/offer UUID. Worker periodically expires stale offers on-chain, then promotes next.
Fresh registrations require occupied + held_offers < capacity; accept consumes offer and increments occupied
atomically with deposit transfer. Public registration cannot steal a held seat.
On-chain does not verify FIFO: gate authority can misorder offers; document this trust and audit worker logs.
If worker is down, offers expire by clock but explicit expire instruction must release held counter.
Permissionless expire enables recovery; frontends can prompt a retry. No silent overbooking.
Reserve enough remaining lifetime cap for held offers: registrations_created + held_offers <= registration_limit.
Joining wallet becomes ineligible after its lifetime registration; registration invalidates queued entry.

## Consistency and workers
Use DB outbox, unique job keys, retries with exponential backoff and leases; multiple workers use
FOR UPDATE SKIP LOCKED. Never hold a SQL lock across an RPC call. Intent and outbox states reconcile after crash.
Index (signature, instruction_index) uniquely and validate owner, program, PDA, signer, amount and logs.
Read confirmed for UX, finalized for durable reconciliation. Store block/slot and commitment; re-read chain
on finality or fork. Rebuild financial projections from accounts after reorg; never pay from DB totals.
All seats serialize through writable Event PDA (acceptable hackathon throughput).
Wallet signs on-chain every economic action; server gate signer only creates offers/admission and QR attestations.
Scheduled jobs cannot create an automatic participant deposit.
No sensitive payloads in logs; structured request IDs and transaction signatures only.

## Component boundaries
API modules: auth, events/search/private access, registrations/transaction intents, waitlist,
attendance/QR, disputes, organizer views. Worker modules: tx reconciliation, offers, no-shows, outbox.
Shared package owns v1 DTOs, amount/time conventions and reference calculations.
Generated chain-client owns PDA derivation, IDL and transaction validation. Frontend must not invent instructions.
