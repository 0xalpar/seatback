# 48-hour implementation roadmap
Foundation phase (this commit): design, shared DTOs, workspace, schema draft, policy tests, frontend task.
Backend MVP now implements auth, events/intents, escrow, refunds, capacity/offers, QR attendance,
no-shows/disputes/withdrawals, PostgreSQL and workers. Frontend remains Developer 2 ownership.
Current focus: hosted SBF tests, finalized IDL compatibility and two-computer integration. No deployment yet.

Hours 0–4: both developers bootstrap; agree interface/hash vectors; backend validate Anchor toolchain,
schema apply and rollback strategy; frontend routes/fixtures/design. Choose independent devnet arbiter wallet.
Hours 4–16: backend auth + event creation + register/cancel/refund Anchor instructions and adversarial tests.
Developer 2 event discovery/details/create forms, Phantom session UX and participant/organizer shells.
Hours 16–26: capacity/offers/waitlist outbox and worker; frontend waitlist/offers/transaction states.
Hours 26–34: attendance co-sign flow, no-show/dispute/cancellation refund/withdrawal; frontend scanner + dispute.
Hours 34–42: integrate against real API/IDL, run local validator end-to-end and devnet test-wallet smoke tests.
Hours 42–48: freeze feature scope, fix invariant failures, polish demo, record exact limitations and rehearsals.

## Merge gates
1. Foundation checks pass; interfaces agreed.
2. Local validator tests establish every money transition and adversarial signer/account rejection.
3. Postgres tests establish RLS, nonce replay resistance, queue concurrency and outbox recovery.
4. Real Phantom + API + validator happy path and refund/dispute paths pass.
5. Dedicated Devnet wallets only; small faucet deposits; no Mainnet. No deployment without backend tests.

If time is short, reduce presentation extras and demo breadth. Do not bypass disputes, capacity, policy
immutability or escrow checks. Mark incomplete paths disabled and explain which are demonstrated.
Production upgrades, appeals governance, commercial operations, notifications/email and custody audit are deferred.
