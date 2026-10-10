import type {EventView,RegistrationView,WaitlistView,Policy,DisputeView} from "@seatback/contracts";
export const seconds=(v:any)=>Math.floor(new Date(v).getTime()/1000);
export function eventView(r:any):EventView {
  const policy:Policy={depositLamports:String(r.deposit_lamports),rule1Deadline:seconds(r.rule1_deadline),
    rule2Deadline:seconds(r.rule2_deadline),checkInOpensAt:seconds(r.check_in_opens_at),
    checkInClosesAt:seconds(r.check_in_closes_at),eventStartsAt:seconds(r.event_starts_at),
    eventEndsAt:seconds(r.event_ends_at),disputeSeconds:86400};
  return {id:r.id,organizer:r.organizer,title:r.title,description:r.description,location:r.location,
    visibility:r.visibility,status:r.status,capacity:r.capacity,occupiedSeats:r.occupied_seats,
    heldOffers:r.held_offers,registrationLimit:r.registration_limit,registrationsCreated:r.registrations_created,
    policy,eventPda:r.event_pda,policyHash:Buffer.from(r.policy_hash).toString("hex")};
}
export function registrationView(r:any):RegistrationView {
  return {id:r.id,eventId:r.event_id,wallet:r.wallet,status:r.status,policySnapshot:r.policy_snapshot,
    policyHash:Buffer.from(r.policy_hash).toString("hex"),reservationPda:r.reservation_pda,
    participantRefundLamports:String(r.participant_paid_lamports),organizerAllocationLamports:String(r.organizer_allocated_lamports),
    disputeDeadline:seconds(r.dispute_deadline),transactionSignature:r.transaction_signature};
}
export function waitlistView(r:any):WaitlistView {
  return {id:r.id,eventId:r.event_id,status:r.status,position:Number(r.position??0),
    offerId:r.offer_id??null,offerExpiresAt:r.offer_expires_at?seconds(r.offer_expires_at):null};
}
export function disputeView(r:any):DisputeView {
  return {id:r.id,registrationId:r.registration_id,eventId:r.event_id,participant:r.wallet,
    status:r.status,evidenceText:r.evidence_text,outcome:r.outcome??null,
    openedAt:r.opened_at?seconds(r.opened_at):null,resolvedAt:r.resolved_at?seconds(r.resolved_at):null,
    deadline:seconds(r.dispute_deadline)};
}
