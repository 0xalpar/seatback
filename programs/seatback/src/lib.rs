use anchor_lang::{prelude::*, system_program::{self, Transfer}};
pub mod state;
pub mod errors;
pub mod logic;
pub mod contexts;
use contexts::*;
use state::*;
use logic::*;
use errors::SeatBackError as E;
// Stable development program public key. No private key is stored in this repository.
// Deployment requires a locally generated program key and keys sync.
declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZqA1QJRF9q8RJkZ8fCkU");

#[program]
pub mod seatback {
    use super::*;
    pub fn create_event(ctx: Context<CreateEvent>, event_id: [u8;16], policy: Policy,
        capacity: u32, registration_limit: u32, metadata_hash: [u8;32],
        gate_authority: Pubkey, dispute_authority: Pubkey) -> Result<()> {
        validate_policy(&policy, Clock::get()?.unix_timestamp)?;
        require!(capacity>0 && registration_limit>=capacity, E::InvalidPolicy);
        require!(gate_authority != Pubkey::default() && dispute_authority != Pubkey::default() &&
            dispute_authority != ctx.accounts.organizer.key() && dispute_authority != gate_authority, E::InvalidAuthority);
        let e = &mut ctx.accounts.event;
        e.version=1; e.organizer=ctx.accounts.organizer.key(); e.event_id=event_id;
        e.policy=policy; e.policy_hash=policy_digest(&policy)?; e.metadata_hash=metadata_hash;
        e.gate_authority=gate_authority; e.dispute_authority=dispute_authority;
        e.capacity=capacity; e.registration_limit=registration_limit; e.status=OPEN; e.bump=ctx.bumps.event;
        record(e.key(), Pubkey::default(), 0, 0, 0)?;
        Ok(())
    }
    pub fn update_event_metadata(ctx: Context<ManageEvent>, metadata_hash: [u8;32]) -> Result<()> {
        let e=&mut ctx.accounts.event;
        require!(e.status==OPEN, E::EventClosed);
        require!(!e.terms_locked && e.registrations_created==0, E::TermsLocked);
        e.metadata_hash=metadata_hash;
        record(e.key(), Pubkey::default(), 1, 0, 0)
    }
    pub fn set_scanner(ctx: Context<SetScanner>, wallet: Pubkey, active: bool) -> Result<()> {
        require!(ctx.accounts.event.status==OPEN, E::EventClosed);
        require!(wallet != ctx.accounts.event.dispute_authority, E::InvalidAuthority);
        let s=&mut ctx.accounts.scanner;
        s.event=ctx.accounts.event.key(); s.wallet=wallet; s.active=active; s.bump=ctx.bumps.scanner;
        record(s.event, Pubkey::default(), 2, 0, 0)
    }
    pub fn register(ctx: Context<Register>, _admission_nonce_hash: [u8;32]) -> Result<()> {
        require!(ctx.accounts.offer.is_none(), E::InvalidOffer);
        reserve(ctx, false)
    }
    pub fn accept_seat_offer(ctx: Context<Register>) -> Result<()> { reserve(ctx, true) }
    pub fn create_seat_offer(ctx: Context<CreateOffer>, offer_id: [u8;16],
        participant: Pubkey, expires_at: i64) -> Result<()> {
        let now=Clock::get()?.unix_timestamp;
        let e=&mut ctx.accounts.event;
        require!(e.status==OPEN && now<e.policy.check_in_opens_at, E::EventClosed);
        require!(participant != Pubkey::default() && now<expires_at &&
            expires_at<=now.checked_add(3600).ok_or(E::Overflow)? &&
            expires_at<=e.policy.check_in_opens_at, E::InvalidOffer);
        available(e)?;
        e.held_offers=inc(e.held_offers)?;
        let o=&mut ctx.accounts.offer;
        o.event=e.key(); o.participant=participant; o.offer_id=offer_id;
        o.expires_at=expires_at; o.status=0; o.bump=ctx.bumps.offer;
        record(e.key(), o.key(), 4, 0, 0)
    }
    pub fn expire_seat_offer(ctx: Context<ExpireOffer>) -> Result<()> {
        let e=&mut ctx.accounts.event; let o=&mut ctx.accounts.offer;
        require!(o.status==0 && (Clock::get()?.unix_timestamp>=o.expires_at || e.status==CANCELLED), E::InvalidOffer);
        o.status=2; e.held_offers=dec(e.held_offers)?;
        record(e.key(), o.key(), 5, 0, 0)
    }
    pub fn cancel_reservation(ctx: Context<Settlement>) -> Result<()> {
        let a=ctx.accounts;
        require_keys_eq!(a.actor.key(), a.reservation.participant, E::InvalidAuthority);
        let now=Clock::get()?.unix_timestamp;
        require!(a.event.status==OPEN && a.reservation.status==RESERVED &&
            now<a.reservation.policy_snapshot.check_in_closes_at, E::InvalidState);
        let amount=refund(&a.reservation.policy_snapshot, now);
        pay_participant(&mut a.event, &mut a.reservation, &a.vault, &a.participant, amount)?;
        allocate(&mut a.event, &mut a.reservation)?;
        a.event.occupied_seats=dec(a.event.occupied_seats)?;
        a.reservation.status=RES_CANCELLED;
        record(a.event.key(), a.reservation.key(), 6, amount, a.reservation.organizer_allocated_lamports)
    }
    pub fn verify_attendance(ctx: Context<Attendance>, qr_nonce_hash: [u8;32]) -> Result<()> {
        let a=ctx.accounts;
        require_keys_eq!(a.participant_signer.key(), a.reservation.participant, E::InvalidAuthority);
        if a.actor.key()!=a.event.organizer {
            let s=a.scanner_authorization.as_ref().ok_or(E::InvalidAuthority)?;
            let (expected,_)=Pubkey::find_program_address(&[b"scanner",a.event.key().as_ref(),a.actor.key().as_ref()], &crate::ID);
            require_keys_eq!(s.key(), expected, E::InvalidAccount);
            require!(s.active && s.event==a.event.key() && s.wallet==a.actor.key(), E::InvalidAuthority);
        }
        let now=Clock::get()?.unix_timestamp;
        let p=a.reservation.policy_snapshot;
        require!(a.event.status==OPEN && a.reservation.status==RESERVED &&
            now>=p.check_in_opens_at && now<p.check_in_closes_at, E::CheckInWindowClosed);
        require!(qr_nonce_hash != [0;32], E::InvalidState);
        pay_participant(&mut a.event,&mut a.reservation,&a.vault,&a.participant,p.deposit_lamports)?;
        a.reservation.attended_at=now; a.reservation.qr_nonce_hash=qr_nonce_hash;
        a.reservation.status=ATTENDED; a.event.occupied_seats=dec(a.event.occupied_seats)?;
        record(a.event.key(), a.reservation.key(), 7, p.deposit_lamports, 0)
    }
    pub fn mark_no_show(ctx: Context<Settlement>) -> Result<()> {
        no_show(&mut ctx.accounts.event, &mut ctx.accounts.reservation)?;
        record(ctx.accounts.event.key(),ctx.accounts.reservation.key(),8,0,
            ctx.accounts.reservation.organizer_allocated_lamports)
    }
    pub fn open_dispute(ctx: Context<OpenDispute>, evidence_hash: [u8;32]) -> Result<()> {
        let a=ctx.accounts; let now=Clock::get()?.unix_timestamp;
        require_keys_eq!(a.actor.key(), a.reservation.participant, E::InvalidAuthority);
        let closes=a.reservation.policy_snapshot.check_in_closes_at;
        require!(a.event.status==OPEN && now>=closes && now<closes.checked_add(DAY).ok_or(E::Overflow)?, E::DisputeWindowClosed);
        if a.reservation.status==RESERVED { no_show(&mut a.event, &mut a.reservation)?; }
        require!(a.reservation.status==NO_SHOW && !a.reservation.dispute_open, E::InvalidState);
        require!(evidence_hash != [0;32], E::InvalidState);
        a.reservation.status=DISPUTED; a.reservation.dispute_open=true;
        a.event.outstanding_disputes=inc(a.event.outstanding_disputes)?;
        let d=&mut a.dispute; d.event=a.event.key(); d.reservation=a.reservation.key();
        d.participant=a.reservation.participant; d.evidence_hash=evidence_hash;
        d.opened_at=now; d.bump=ctx.bumps.dispute;
        record(a.event.key(),a.reservation.key(),9,0,0)
    }
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, outcome: u8) -> Result<()> {
        let a=ctx.accounts;
        require_keys_eq!(a.actor.key(), a.event.dispute_authority, E::InvalidAuthority);
        require!(a.event.status==OPEN && a.dispute.outcome==0 &&
            a.reservation.dispute_open && a.reservation.status==DISPUTED &&
            a.dispute.participant==a.reservation.participant && (outcome==1 || outcome==2), E::InvalidState);
        let mut paid=0;
        if outcome==1 {
            clear_allocation(&mut a.event,&mut a.reservation)?;
            paid=sub(a.reservation.policy_snapshot.deposit_lamports,a.reservation.participant_paid_lamports)?;
            pay_participant(&mut a.event,&mut a.reservation,&a.vault,&a.participant,paid)?;
            a.reservation.status=ATTENDED;
        } else { a.reservation.status=NO_SHOW; }
        a.dispute.outcome=outcome; a.dispute.resolved_at=Clock::get()?.unix_timestamp;
        a.reservation.dispute_open=false; a.event.outstanding_disputes=dec(a.event.outstanding_disputes)?;
        record(a.event.key(),a.reservation.key(),10,paid,a.reservation.organizer_allocated_lamports)
    }
    pub fn cancel_event(ctx: Context<ManageEvent>) -> Result<()> {
        let e=&mut ctx.accounts.event;
        require!(e.status==OPEN && Clock::get()?.unix_timestamp<cutoff(&e.policy)?, E::EventClosed);
        e.status=CANCELLED;
        record(e.key(),Pubkey::default(),11,0,0)
    }
    pub fn claim_cancelled_event_refund(ctx: Context<CancelledRefund>) -> Result<()> {
        let a=ctx.accounts;
        require!(a.event.status==CANCELLED && a.reservation.organizer_paid_lamports==0, E::InvalidState);
        if a.reservation.dispute_open {
            let d=a.dispute.as_mut().ok_or(E::InvalidAccount)?;
            let (expected,_)=Pubkey::find_program_address(&[b"dispute",a.reservation.key().as_ref()], &crate::ID);
            require!(d.key()==expected && d.event==a.event.key() && d.reservation==a.reservation.key() &&
                d.participant==a.reservation.participant && d.outcome==0, E::InvalidAccount);
            d.outcome=1; d.resolved_at=Clock::get()?.unix_timestamp;
            a.reservation.dispute_open=false; a.event.outstanding_disputes=dec(a.event.outstanding_disputes)?;
        }
        if a.reservation.status==RESERVED { a.event.occupied_seats=dec(a.event.occupied_seats)?; }
        clear_allocation(&mut a.event,&mut a.reservation)?;
        let amount=sub(a.reservation.policy_snapshot.deposit_lamports,a.reservation.participant_paid_lamports)?;
        require!(amount>0, E::AlreadyPaid);
        pay_participant(&mut a.event,&mut a.reservation,&a.vault,&a.participant,amount)?;
        a.reservation.status=SETTLED;
        record(a.event.key(),a.reservation.key(),12,amount,0)
    }
    pub fn settle_no_show(ctx: Context<Settlement>) -> Result<()> {
        let a=ctx.accounts;
        require!(a.event.status==OPEN || a.event.status==CLOSED, E::EventClosed);
        require!(Clock::get()?.unix_timestamp>=cutoff(&a.reservation.policy_snapshot)?, E::DisputeWindowClosed);
        require!(!a.reservation.dispute_open, E::UnresolvedDisputes);
        if a.reservation.status==RESERVED { no_show(&mut a.event,&mut a.reservation)?; }
        require!(a.reservation.status==NO_SHOW, E::InvalidState);
        record(a.event.key(),a.reservation.key(),13,0,a.reservation.organizer_allocated_lamports)
    }
    pub fn withdraw_allocation(ctx: Context<Settlement>) -> Result<()> {
        let a=ctx.accounts;
        require_keys_eq!(a.actor.key(), a.event.organizer, E::InvalidAuthority);
        require!(a.event.status==OPEN || a.event.status==CLOSED, E::EventClosed);
        require!(Clock::get()?.unix_timestamp>=cutoff(&a.reservation.policy_snapshot)?, E::DisputeWindowClosed);
        require!(a.event.outstanding_disputes==0 && !a.reservation.dispute_open, E::UnresolvedDisputes);
        require!(a.reservation.status==NO_SHOW || a.reservation.status==RES_CANCELLED, E::InvalidState);
        let amount=sub(a.reservation.organizer_allocated_lamports,a.reservation.organizer_paid_lamports)?;
        require!(amount>0, E::AlreadyPaid);
        transfer_out(&a.vault,&a.organizer.to_account_info(),amount)?;
        a.reservation.organizer_paid_lamports=add(a.reservation.organizer_paid_lamports,amount)?;
        a.event.organizer_allocated_lamports=sub(a.event.organizer_allocated_lamports,amount)?;
        a.event.outstanding_lamports=sub(a.event.outstanding_lamports,amount)?;
        a.reservation.status=SETTLED;
        record(a.event.key(),a.reservation.key(),14,0,amount)
    }
    pub fn finalize_event(ctx: Context<FinalizeEvent>) -> Result<()> {
        let e=&mut ctx.accounts.event;
        require!(e.status==OPEN && Clock::get()?.unix_timestamp>=cutoff(&e.policy)?, E::EventClosed);
        require!(e.outstanding_disputes==0, E::UnresolvedDisputes);
        e.status=CLOSED; record(e.key(),Pubkey::default(),15,0,0)
    }
}
fn policy_digest(p: &Policy) -> Result<[u8;32]> {
    use sha2::{Digest, Sha256};
    let mut digest=Sha256::new();
    digest.update(b"seatback:policy:v1");
    digest.update(p.try_to_vec()?);
    Ok(digest.finalize().into())
}
fn available(e: &Event) -> Result<()> {
    require!(e.occupied_seats.checked_add(e.held_offers).ok_or(E::Overflow)?<e.capacity,E::CapacityExceeded);
    require!(e.registrations_created.checked_add(e.held_offers).ok_or(E::Overflow)?<e.registration_limit,E::RegistrationLimitReached);
    Ok(())
}
fn reserve(ctx: Context<Register>, offered: bool) -> Result<()> {
    let a=ctx.accounts; let now=Clock::get()?.unix_timestamp;
    require!(a.event.status==OPEN && now<a.event.policy.check_in_opens_at,E::EventClosed);
    if offered {
        let o=a.offer.as_mut().ok_or(E::InvalidOffer)?;
        let (expected,_)=Pubkey::find_program_address(&[b"offer",a.event.key().as_ref(),&o.offer_id], &crate::ID);
        require!(o.key()==expected && o.event==a.event.key() && o.participant==a.participant.key() &&
            o.status==0 && now<o.expires_at,E::InvalidOffer);
        o.status=1; a.event.held_offers=dec(a.event.held_offers)?;
    }
    available(&a.event)?;
    let deposit=a.event.policy.deposit_lamports;
    system_program::transfer(CpiContext::new(a.system_program.to_account_info(), Transfer {
        from:a.participant.to_account_info(), to:a.vault.to_account_info()
    }),deposit)?;
    let r=&mut a.reservation;
    r.event=a.event.key(); r.participant=a.participant.key(); r.policy_snapshot=a.event.policy;
    r.policy_hash=a.event.policy_hash; r.status=RESERVED; r.bump=ctx.bumps.reservation;
    let v=&mut a.vault; v.event=a.event.key(); v.reservation=r.key(); v.bump=ctx.bumps.vault;
    a.event.registrations_created=inc(a.event.registrations_created)?;
    a.event.occupied_seats=inc(a.event.occupied_seats)?;
    a.event.outstanding_lamports=add(a.event.outstanding_lamports,deposit)?;
    a.event.terms_locked=true;
    record(a.event.key(),r.key(),3,deposit,0)
}
fn allocate(e: &mut Event, r: &mut Reservation) -> Result<()> {
    require!(r.organizer_allocated_lamports==0 && r.organizer_paid_lamports==0,E::InvalidState);
    let amount=sub(r.policy_snapshot.deposit_lamports,r.participant_paid_lamports)?;
    r.organizer_allocated_lamports=amount;
    e.organizer_allocated_lamports=add(e.organizer_allocated_lamports,amount)?;
    Ok(())
}
fn clear_allocation(e: &mut Event, r: &mut Reservation) -> Result<()> {
    require!(r.organizer_paid_lamports==0,E::InvalidState);
    e.organizer_allocated_lamports=sub(e.organizer_allocated_lamports,r.organizer_allocated_lamports)?;
    r.organizer_allocated_lamports=0; Ok(())
}
fn no_show(e: &mut Event, r: &mut Reservation) -> Result<()> {
    require!((e.status==OPEN || e.status==CLOSED) && r.status==RESERVED &&
        Clock::get()?.unix_timestamp>=r.policy_snapshot.check_in_closes_at,E::InvalidState);
    allocate(e,r)?; r.status=NO_SHOW; e.occupied_seats=dec(e.occupied_seats)?; Ok(())
}
fn pay_participant(e: &mut Event,r: &mut Reservation,v: &Account<Vault>,to: &SystemAccount,amount: u64) -> Result<()> {
    let paid=add(r.participant_paid_lamports,amount)?;
    require!(add(paid,r.organizer_paid_lamports)?<=r.policy_snapshot.deposit_lamports,E::InsufficientEscrow);
    transfer_out(v,&to.to_account_info(),amount)?;
    r.participant_paid_lamports=paid; e.outstanding_lamports=sub(e.outstanding_lamports,amount)?; Ok(())
}
fn transfer_out(v: &Account<Vault>,to: &AccountInfo,amount: u64) -> Result<()> {
    require!(v.key()!=to.key(),E::InvalidAccount);
    let info=v.to_account_info(); let reserve=Rent::get()?.minimum_balance(info.data_len());
    let left=info.lamports().checked_sub(amount).ok_or(E::InsufficientEscrow)?;
    require!(left>=reserve,E::InsufficientEscrow);
    let dest=add(to.lamports(),amount)?;
    **info.try_borrow_mut_lamports()?=left;
    **to.try_borrow_mut_lamports()?=dest;
    Ok(())
}
#[event]
pub struct SeatBackEvent {
    pub event: Pubkey, pub account: Pubkey, pub kind: u8,
    pub participant_amount: u64, pub organizer_amount: u64, pub timestamp: i64,
}
fn record(event:Pubkey,account:Pubkey,kind:u8,participant_amount:u64,organizer_amount:u64)->Result<()> {
    emit!(SeatBackEvent {event,account,kind,participant_amount,organizer_amount,timestamp:Clock::get()?.unix_timestamp});
    Ok(())
}
