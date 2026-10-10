# HTTP API v1
Business routes are implemented on backend; startup requires PostgreSQL, signer, generated IDL and Devnet RPC.
packages/contracts/src/index.ts is the wire type source; docs/openapi.json specifies routes and payloads.
Base URL http://localhost:3001; all /v1 endpoints JSON except no-content responses.
Decimal lamport strings (u64), Unix seconds integer UTC, UUID IDs, base58 wallet/PDA/signature strings.
Cursor pagination: limit 1..50 default 20, opaque nextCursor. Never infer wallet auth from request body.
Error envelope ApiError; 400 invalid input, 401 no session, 403 forbidden, 404 absent/hidden, 409 state/race,
410 expired, 422 invalid policy/transaction, 429 rate limited, 503 RPC unavailable.
Financial POSTs require Idempotency-Key UUID, wallet+route+key unique; reused key/different body 409.
Writes need Origin and X-CSRF-Token. Cookie session; credentials include. All errors include request ID.
GET /v1/auth/session also provides CSRF token to same-origin authenticated client.

## Endpoint contract
| Method / route | Request | Response | Auth |
| --- | --- | --- | --- |
| POST /v1/auth/challenge | {wallet, domain, uri} | {challengeId,message,expiresAt} 201 | public/rate limit |
| POST /v1/auth/verify | {challengeId,wallet,signatureBase64} | {wallet,expiresAt,csrfToken} 200 + Set-Cookie | public |
| GET /v1/auth/session | none | {wallet,expiresAt,csrfToken} 200 | session |
| POST /v1/auth/logout | {} | 204, revoke cookie | session |
| GET /v1/events?q=&cursor=&limit= | filters | Page<EventView> 200; public only | public |
| POST /v1/events | CreateEventInput | {eventId,intent:TxIntent} 201, draft until confirmation | organizer wallet |
| GET /v1/events/{eventId} | none | EventView 200 | public or private admission |
| GET /v1/events/{eventId}/capabilities | none | EventCapabilities 200 | session; computed from wallet and chain roles |
| PATCH /v1/events/{eventId} | {title,description,location} | TxIntent 201 | organizer, before first registration; metadata hash update |
| POST /v1/events/{eventId}/access | {code} | {eventId,expiresAt} 200 | session |
| POST /v1/events/{eventId}/register | {} | TxIntent 201 | session + admission |
| POST /v1/registrations/{registrationId}/cancel | {} | TxIntent 201, refund preview derives from snapshot | owner |
| POST /v1/events/{eventId}/cancel | {} | TxIntent 201 | organizer |
| POST /v1/registrations/{registrationId}/claim-refund | {} | TxIntent 201 | owner (chain claim permissionless) |
| POST /v1/registrations/{registrationId}/withdraw | {} | TxIntent 201 | event organizer |
| GET /v1/me/registrations?cursor=&limit= | none | Page<RegistrationView> 200 | owner session |
| GET /v1/me/waitlist?cursor=&limit= | none | Page<WaitlistView> 200 | session |
| POST /v1/events/{eventId}/waitlist | {} | WaitlistView 201 | session + admission; no deposit |
| DELETE /v1/events/{eventId}/waitlist | none | 204; existing chain hold releases at expiry via worker | owner |
| POST /v1/offers/{offerId}/accept | {} | TxIntent 201 | offered wallet |
| GET /v1/organizer/events?cursor=&limit= | none | Page<EventView> 200 | organizer |
| GET /v1/events/{eventId}/participants?cursor=&limit= | none | Page<RegistrationView> 200 | organizer/scanner (scanner reduced projection in future) |
| POST /v1/events/{eventId}/scanners | {wallet} | TxIntent 201 | organizer |
| DELETE /v1/events/{eventId}/scanners/{wallet} | none | TxIntent 201 | organizer |
| POST /v1/registrations/{registrationId}/qr | {} | {token,expiresAt} 201 | owner reserved |
| POST /v1/events/{eventId}/attendance/verify | {token} | {intent:TxIntent,participant:wallet} 201 | authorized scanner |
| POST /v1/registrations/{registrationId}/disputes | {evidenceText} | {disputeId,intent:TxIntent} 201 | owner, private evidence |
| POST /v1/disputes/{disputeId}/resolve | {outcome:"participant"|"organizer"} | TxIntent 201 | fixed arbiter |
| GET /v1/me/disputes?cursor=&limit= | none | Page<DisputeView> 200 | participant's own disputes |
| GET /v1/arbiter/disputes?cursor=&limit= | none | Page<DisputeView> 200 | fixed arbiter, assigned disputes only |
| POST /v1/transactions/submit | {intentId,signedTransactionBase64} | TxReceipt 202 | expected signer; co-sign flow supported |
| GET /v1/transactions/{intentId} | none | TxReceipt 200 | intent owner/authorized cosigner |

## Transaction protocol
Create draft/intent -> deserialize/inspect -> Phantom signs -> submit -> pending -> confirmed -> index finalized.
TxIntent is an unsigned or partially signed Solana legacy transaction (compatible Anchor SDK);
fee payer, instruction program, accounts/amount, required signers and recent blockhash are fixed.
Server gate/scanner signer may partially sign, never hold participant keys. Participant attendance
co-sign intent must be delivered only through an authenticated participant polling flow:
GET /v1/me/attendance-intents returns {items:TxIntent[]} of pending intents for that wallet.
Scanner UI displays awaiting participant approval; participant UI polls this endpoint, validates then signs.
Scanner must also authorize signing on its computer if using wallet scanner rather than server-held gate.
v1 API scanner endpoint returns unsigned intent for scanner to sign first; submit retains partially signed
transaction and returns pending until participant signature is present. No chain broadcast before all signatures.
Define one immutable message hash per intent; combining signatures on different messages is rejected.
Blockhash/offer expiration generates a new intent, never mutates signed message.
Wallet rejection keeps reservation unchanged. Confirmation timeout stays pending; no success toast until verified.
Idempotent duplicate submit returns same receipt; verify message hash, signer set, program and chain result.
TxReceipt.signature is null while waiting for co-signatures before broadcast. Refund/allocation DTO fields
report confirmed cumulative participant payouts and organizer entitlement, respectively; they are not previews.
Never accept arbitrary signed transactions for broadcast.

## Frontend mock boundary
Implement a SeatBackApi interface in apps/web using exactly these DTOs and explicit fixture transport.
Mock mode must have persistent visible banner and cannot submit transactions. Real 501 is displayed as
unavailable, never replaced with fake success. See docs/backend-integration.md for IDL and real backend setup.
