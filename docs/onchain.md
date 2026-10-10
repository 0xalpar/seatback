# Anchor specification v1 (not implemented)
Scaffold uses Anchor 0.32.1. Only version() exists. No escrow can be initialized yet.
State layouts in programs/seatback/src/state.rs are proposed, not a generated IDL.
Program address is intentionally an unusable placeholder; replace before build/deploy.

## PDA/account definitions
Seeds use literal UTF-8 prefixes, 16-byte UUID bytes (not UUID text), 32-byte pubkeys and canonical bumps.
Every instruction checks program ownership, seeds, bump, event relation and signer.
Account space = 8-byte discriminator + INIT_SPACE; keep rent reserve distinct from deposit ledger.
- Event: ["event", organizer, event_uuid]. Holds immutable organizer, policy/hash, metadata hash,
  fixed gate/arbiter, capacity, lifetime registration cap/counter, occupied/held counters,
  outstanding disputes, outstanding lamports and organizer allocation aggregates; status 0 draft/1 open/2 cancelled/3 closed.
- Reservation: ["reservation", event, participant]. One lifetime PDA; policy snapshot/hash, payment ledgers,
  attendance time/QR nonce hash/dispute flag; status 0 reserved/1 attended/2 cancelled/3 no_show/4 disputed/5 settled.
- Vault: ["vault", reservation]. Program-owned account, event/reservation pointers. Holds rent + remaining deposit.
  Each payout reduces recorded outstanding amount, using checked lamport arithmetic and no realloc.
- SeatOffer: ["offer", event, offer_uuid]. Wallet, expires_at, status 0 active/1 accepted/2 expired.
- Scanner: ["scanner", event, scanner_wallet]. Organizer-controlled active flag; no custody rights.
- Dispute: ["dispute", reservation]. Evidence hash, open/resolve times, outcome 0 open/1 participant/2 organizer.
Keep reservation/dispute tombstones. Do not close vault before all liabilities are zero.
Rent reclaim is deferred v1; no unreviewed close instruction.

## Canonical hashing
Policy hash = SHA-256("seatback:policy:v1" UTF-8 || Borsh Policy in Rust field order).
u64 deposit and i64 times little-endian; u32 dispute seconds little-endian; no JSON hashing.
Metadata hash = SHA-256 UTF-8 canonical serialized metadata using RFC 8785; do not include access code.
Implement cross-language test vectors before integration. These hashes are not implemented yet.

## Instruction contracts
All transfers target recorded participant/organizer; caller cannot choose payout destination.
Common accounts: Event writable, Clock sysvar read, authorized signer; SystemProgram only when
creating account/participant deposit CPI. Event+Reservation+Vault relationships always validated.
All create operations include rent payer signer. All args/accounts remain subject to generated IDL.

| Instruction(args) | Signers and accounts beyond Event | Preconditions / atomic effects |
| --- | --- | --- |
| create_event(event_uuid, policy, capacity, registration_limit, metadata_hash, gate_authority, dispute_authority) | organizer payer, SystemProgram | init Event open; positive deposit/capacity; cap >= capacity; rule ordering; now < rule1; distinct independent arbiter |
| update_event_metadata(metadata_hash) | organizer | only before first registration; no authority/policy mutation in v1 |
| authorize_scanner(scanner_wallet) / revoke_scanner() | organizer, Scanner PDA, payer+SystemProgram for init | organizer or active scanner may scan; revocation immediate on-chain |
| register(admission_nonce_hash) | participant payer, Reservation/Vault init, gate signer, SystemProgram | event open, before check-in opens, no lifetime reservation, free capacity and cap; gate signer confirms private access (also required for public in v1); exact deposit CPI; snapshot; lock terms; increment lifetime/occupied/outstanding |
| cancel_reservation() | participant, Reservation, Vault, participant payout account | reserved, now < closes, event not cancelled; use snapshot deadlines, transfer refund, record organizer entitlement, decrement occupied exactly once |
| create_seat_offer(offer_uuid, participant, expires_at) | gate signer payer, SeatOffer init, SystemProgram | open, before opens, now < expiry <= min(now+3600, opens); available capacity/lifetime cap; increment held |
| accept_seat_offer() | participant payer, SeatOffer, Reservation/Vault init, SystemProgram | matching wallet, offer active, now < expiry, open; consume held, init reservation and exact deposit; lifetime cap; same immutable snapshot |
| expire_seat_offer() | any payer, SeatOffer | active and now >= expiry; decrement held once; repeat rejected |
| verify_attendance(qr_nonce_hash) | organizer or active Scanner signer, participant signer, Reservation/Vault, participant payout | open, reserved, [opens,closes); participant signs short-lived transaction after QR challenge; record nonce/attendance and refund 100%, decrement occupied |
| mark_no_show() | any payer, Reservation/Vault | reserved and now >= closes, event open; set no_show; allocate deposit but pay organizer nothing; decrement occupied |
| open_dispute(evidence_hash) | participant payer, Reservation, Dispute init, SystemProgram | no_show OR reserved after closes (materialize no_show atomically); now < closes+86400; once per reservation; increment event unresolved |
| resolve_dispute(outcome) | fixed independent arbiter, Dispute, Reservation/Vault, participant payout | open dispute; outcome participant pays remaining full refund, organizer allocates remaining; decrement unresolved exactly once; no arbitrary split |
| cancel_event() | organizer | open and now < max(ends,closes+86400); mark cancelled; disable offers/admissions/withdrawals; claims compute remaining refunds without scanning all accounts |
| claim_cancelled_event_refund() | any caller, Reservation/Vault, recorded participant payout, Dispute if open | cancelled; refund deposit minus already paid participant; clear this reservation allocation; resolve pending dispute as participant and decrement count once |
| settle_no_show() | any caller, Reservation/Vault | window over, event open, no reservation dispute; materialize no_show if worker delayed; freeze organizer entitlement, never transfers early |
| withdraw_allocation() | organizer, Reservation/Vault, organizer payout | event open/closed, now >= cutoff, event unresolved==0, reserved must first settle, no open reservation dispute; exact remaining organizer entitlement once |
| finalize_event() | any caller | open, cutoff passed, event unresolved==0; set closed; cancellation forbidden, claims/withdrawals continue |

Verified attendance requires participant co-signature: API stores challenge -> participant scans/shows QR ->
authorized scanner initiates -> participant approves the short-lived transaction in Phantom.
This adds UX friction but prevents server-issued QR alone authorizing a refund. API expiry/QR checks are
off-chain; on-chain eligibility/window/state and both signatures are mandatory. An already signed transaction
can land until blockhash expires (even if HTTP QR token expires), only while on-chain check-in window holds.

Allocation aggregate bookkeeping: participant refund reduces outstanding; initial allocation increments organizer total;
event cancellation uses a flag rather than eagerly iterating. Each claim clears its allocation in the aggregate;
withdraw subtracts allocation/outstanding. Event counts may be lazily cleared for cancelled offers on expire/cleanup,
but never reused for admission to cancelled event. Duplicate/mismatched accounts fail before lamport mutation.
No cross-instruction bypass: every transfer path independently checks event state, liability and authority.

## Required events/errors
Emit EventCreated, ReservationCreated, ReservationCancelled, SeatOffered, OfferExpired, OfferAccepted,
AttendanceVerified, NoShowMarked, DisputeOpened, DisputeResolved, EventCancelled, RefundClaimed, AllocationWithdrawn.
Each includes event/reservation keys where relevant, amount, timestamp and state.
Errors: InvalidPolicy, InvalidAuthority, InvalidPda, EventClosed, TermsLocked, CapacityExceeded,
RegistrationLimitReached, AlreadyRegistered, OfferExpired, OfferWalletMismatch, InvalidState,
CheckInWindowClosed, Replay, DisputeWindowClosed, UnresolvedDisputes, AlreadyPaid, Overflow.
UncheckedAccount requires a written safety invariant; no client-supplied clock, refund amount or policy.
