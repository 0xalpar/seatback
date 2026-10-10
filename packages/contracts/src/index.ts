/** v1 wire types. SOL amounts are integer lamport strings; timestamps are Unix seconds. */
export type WalletAddress = string;
export type Lamports = string;
export type UnixSeconds = number;
export type EventStatus = "draft" | "open" | "cancelled" | "closed";
export type RegistrationStatus = "reserved" | "attended" | "cancelled" | "no_show" | "disputed" | "settled";
export type WaitlistStatus = "queued" | "offered" | "accepted" | "expired" | "left";
export interface Policy {
  depositLamports: Lamports;
  rule1Deadline: UnixSeconds;
  rule2Deadline: UnixSeconds;
  checkInOpensAt: UnixSeconds;
  checkInClosesAt: UnixSeconds;
  eventStartsAt: UnixSeconds;
  eventEndsAt: UnixSeconds;
  disputeSeconds: 86400;
}
export interface EventView {
  id: string; organizer: WalletAddress; title: string; description: string;
  location: string; visibility: "public" | "private"; status: EventStatus;
  capacity: number; occupiedSeats: number; heldOffers: number;
  registrationLimit: number; registrationsCreated: number; policy: Policy;
  eventPda: string | null; policyHash: string;
}
export interface CreateEventInput {
  title: string; description: string; location: string; visibility: "public" | "private";
  accessCode?: string; capacity: number; registrationLimit: number; policy: Policy;
}
export interface RegistrationView {
  id: string; eventId: string; wallet: WalletAddress; status: RegistrationStatus;
  policySnapshot: Policy; policyHash: string; reservationPda: string;
  participantRefundLamports: Lamports; organizerAllocationLamports: Lamports;
  disputeDeadline: UnixSeconds; transactionSignature: string | null;
}
export interface WaitlistView {
  id: string; eventId: string; status: WaitlistStatus; position: number;
  offerId: string | null; offerExpiresAt: UnixSeconds | null;
}
export interface TxIntent {
  intentId: string; cluster: "devnet"; transactionBase64: string;
  expiresAt: UnixSeconds; lastValidBlockHeight: number; expectedSigner: WalletAddress;
}
export interface TxReceipt {
  intentId: string; signature: string | null; status: "pending" | "confirmed" | "failed";
}
export interface ApiError {
  error: { code: string; message: string; requestId: string; retryable: boolean };
}
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface EventCapabilities { canManage: boolean; canScan: boolean; canArbitrate: boolean }
export interface DisputeView {
  id: string; registrationId: string; eventId: string; participant: WalletAddress;
  status: "pending" | "open" | "resolved"; evidenceText: string;
  outcome: "participant" | "organizer" | null; openedAt: UnixSeconds | null;
  resolvedAt: UnixSeconds | null; deadline: UnixSeconds;
}
export const API_VERSION = "v1";
export const DISPUTE_SECONDS = 86400;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const U64_MAX = 18_446_744_073_709_551_615n;
export function parseLamports(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("INVALID_LAMPORTS");
  const amount = BigInt(value);
  if (amount > U64_MAX) throw new Error("LAMPORTS_OVERFLOW");
  return amount;
}
export function validatePolicy(p: Policy): void {
  if (parseLamports(p.depositLamports) === 0n) throw new Error("ZERO_DEPOSIT");
  const times = [p.rule1Deadline,p.rule2Deadline,p.checkInOpensAt,p.checkInClosesAt,p.eventStartsAt,p.eventEndsAt];
  if (times.some(t => !Number.isSafeInteger(t) || t < 0)) throw new Error("INVALID_TIMESTAMP");
  if (!(p.rule1Deadline < p.rule2Deadline && p.rule2Deadline <= p.checkInOpensAt &&
    p.checkInOpensAt <= p.eventStartsAt && p.eventStartsAt < p.checkInClosesAt &&
    p.checkInClosesAt <= p.eventEndsAt)) throw new Error("INVALID_DEADLINE_ORDER");
  if (p.disputeSeconds !== DISPUTE_SECONDS) throw new Error("INVALID_DISPUTE_WINDOW");
}
/** Reference policy oracle only; chain implementation must independently enforce this. */
export function cancellationSplit(deposit: string, now: number, rule1: number, rule2: number) {
  const total = parseLamports(deposit);
  if (![now,rule1,rule2].every(Number.isSafeInteger) || rule1 >= rule2) throw new Error("INVALID_DEADLINES");
  const participant = now < rule1 ? total : now < rule2 ? total * 30n / 100n : 0n;
  return { participant: participant.toString(), organizer: (total - participant).toString() };
}
export function disputeDeadline(checkInClosesAt: number): number {
  if (!Number.isSafeInteger(checkInClosesAt) || checkInClosesAt < 0 ||
    !Number.isSafeInteger(checkInClosesAt + DISPUTE_SECONDS)) throw new Error("INVALID_TIMESTAMP");
  return checkInClosesAt + DISPUTE_SECONDS;
}
export function mayWithdraw(now: number, closesAt: number, endsAt: number, unresolved: number): boolean {
  if (![now, closesAt, endsAt, unresolved].every(Number.isSafeInteger) ||
    unresolved < 0 || endsAt < closesAt) return false;
  return now >= Math.max(endsAt, disputeDeadline(closesAt)) && unresolved === 0;
}
