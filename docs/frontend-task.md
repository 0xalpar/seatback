# Claude frontend task — exact scope
Repository https://github.com/0xalpar/seatback, branch frontend. Do not create another repo.
Read AGENTS.md, README.md, docs/architecture.md, docs/api-contract.md, docs/onchain.md, docs/security.md,
docs/testing.md, docs/openapi.json and packages/contracts/src/index.ts before changes.
Implement apps/web only, with frontend-specific tests and docs. Backend/API/Anchor/schema/contract ownership is Codex.
Frontend dependencies may change apps/web/package.json and pnpm-lock.yaml; coordinate lockfile conflict resolution.
Do not edit API contracts or invent routes/IDL. Report required contract changes in PR.

## Deliverables
1. Responsive accessible React/TypeScript app, consistent typography, navigation, Devnet badge.
2. Routes: public /events search/list with pagination; /events/:id details and private access code;
   /organizer/events and /organizer/events/new; /organizer/events/:id overview/participants/scanners/cancel;
   /me registrations + history + waitlists; /offers/:id offer accept; /scan/:eventId authorized scanner;
   /registrations/:id attendance QR, cancel/refund/dispute; arbiter dispute decision UI behind role capability.
   Read /v1/events/:id/capabilities for role actions; /v1/me/disputes and /v1/arbiter/disputes for dispute lists.
3. Event creation validates all policy ordering/capacity/lifetime cap/deposit constraints; show immutable-terms
   acknowledgement. Convert decimal SOL text to lamport string without floats. Display local timezone and UTC.
4. Phantom connection and domain-bound signed-message login using challenge/verify/session/logout contracts.
   Wallet connect alone is not login. Handle absent wallet, wrong account, rejected message/transaction and expired session.
   Add compatible wallet/transaction dependencies deliberately, avoiding mixed Solana SDK transaction classes.
5. Typed API client with credentials include, CSRF and idempotency headers; transport abstraction for fixtures.
   Use shared types. All mock fixtures isolated in apps/web, with visible "Demo data — no transactions" banner.
   Mock mode must disable all real transaction submission. Real mode must show 501 unavailable.
6. Show refund rules/deadlines before registering and snapshot rules after. Money labelled Devnet SOL,
   rent/fees separate. Full refund before rule1, 30% before rule2, otherwise organizer allocation;
   attended 100%; cancelled event remaining deposit claim. Pending allocation is not money already withdrawn.
7. Participant registration/cancellation/refund and organizer withdrawal use API TxIntent, decode and validate
   network/program/expected signer/instruction/amount/recipients using eventual backend chain-client. Until generated
   IDL/client arrives, real signing/submission stays disabled with explanation; no guessed validation.
   Wallet rejection, pending, confirmed, failed and expired blockhash are distinct states.
8. Free waitlist UX: queue position, active offer countdown, expired offers, capacity/registration-limit errors,
   accept requires deposit signature. Use backend server expiry; countdown is informational, never seat authority.
9. QR attendance: participant requests expiring token, scanner camera/manual token entry with authorization,
   awaiting participant co-sign state; participant polls /v1/me/attendance-intents and approves verified intent.
   Show success only on confirmed chain outcome. Camera denied/duplicate/expired tokens have clear errors.
10. No-show UI shows exact dispute deadline from check-in closes +86400. Evidence private; file text dispute,
    unresolved state blocks withdrawal. Arbiter resolution requires its wallet. Event cancellation warns organizer
    of full remaining refunds. Never promise automatic settlement while dispute unresolved.
11. Empty/loading/error/offline states, mobile/keyboard support, safe copy labels and no secret logging.

## Acceptance
pnpm check:foundation and pnpm check pass from clean install. Add meaningful frontend tests for policy displays,
SOL conversion, rejection/501, expired offers, protected routes and QR flow (mock).
Document any new dependencies, actual checks, unimplemented integration and backend needs.
Commit/push frontend branch; open PR into main, do not merge or force-push. No real funds or Mainnet.
Give a concise summary and PR URL. Work independently using fixtures until backend is available.
