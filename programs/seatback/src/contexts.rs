use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(event_id: [u8;16])]
pub struct CreateEvent<'info> {
    #[account(init, payer=organizer, space=8+Event::INIT_SPACE,
        seeds=[b"event", organizer.key().as_ref(), &event_id], bump)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub organizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ManageEvent<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump,
        has_one=organizer)]
    pub event: Account<'info, Event>,
    pub organizer: Signer<'info>,
}
#[derive(Accounts)]
pub struct FinalizeEvent<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
}
#[derive(Accounts)]
pub struct Register<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(init, payer=participant, space=8+Reservation::INIT_SPACE,
        seeds=[b"reservation", event.key().as_ref(), participant.key().as_ref()], bump)]
    pub reservation: Account<'info, Reservation>,
    #[account(init, payer=participant, space=8+Vault::INIT_SPACE,
        seeds=[b"vault", reservation.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub participant: Signer<'info>,
    #[account(address=event.gate_authority)]
    pub gate: Signer<'info>,
    #[account(mut)]
    pub offer: Option<Account<'info, SeatOffer>>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(offer_id: [u8;16])]
pub struct CreateOffer<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(init, payer=gate, space=8+SeatOffer::INIT_SPACE,
        seeds=[b"offer", event.key().as_ref(), &offer_id], bump)]
    pub offer: Account<'info, SeatOffer>,
    #[account(mut, address=event.gate_authority)]
    pub gate: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ExpireOffer<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"offer", event.key().as_ref(), &offer.offer_id], bump=offer.bump, has_one=event)]
    pub offer: Account<'info, SeatOffer>,
}
#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetScanner<'info> {
    #[account(seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump, has_one=organizer)]
    pub event: Account<'info, Event>,
    #[account(init_if_needed, payer=organizer, space=8+Scanner::INIT_SPACE,
        seeds=[b"scanner", event.key().as_ref(), wallet.as_ref()], bump)]
    pub scanner: Account<'info, Scanner>,
    #[account(mut)]
    pub organizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Settlement<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"reservation", event.key().as_ref(), reservation.participant.as_ref()],
        bump=reservation.bump, has_one=event)]
    pub reservation: Account<'info, Reservation>,
    #[account(mut, seeds=[b"vault", reservation.key().as_ref()], bump=vault.bump,
        has_one=event, has_one=reservation)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address=reservation.participant)]
    pub participant: SystemAccount<'info>,
    #[account(mut, address=event.organizer)]
    pub organizer: SystemAccount<'info>,
    #[account(mut)]
    pub actor: Signer<'info>,
}
#[derive(Accounts)]
pub struct Attendance<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"reservation", event.key().as_ref(), reservation.participant.as_ref()],
        bump=reservation.bump, has_one=event)]
    pub reservation: Account<'info, Reservation>,
    #[account(mut, seeds=[b"vault", reservation.key().as_ref()], bump=vault.bump,
        has_one=event, has_one=reservation)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address=reservation.participant)]
    pub participant: SystemAccount<'info>,
    #[account(mut, address=event.organizer)]
    pub organizer: SystemAccount<'info>,
    #[account(mut)]
    pub actor: Signer<'info>,
    pub participant_signer: Signer<'info>,
    pub scanner_authorization: Option<Account<'info, Scanner>>,
}
#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"reservation", event.key().as_ref(), reservation.participant.as_ref()],
        bump=reservation.bump, has_one=event)]
    pub reservation: Account<'info, Reservation>,
    #[account(mut, seeds=[b"vault", reservation.key().as_ref()], bump=vault.bump,
        has_one=event, has_one=reservation)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address=reservation.participant)]
    pub participant: SystemAccount<'info>,
    #[account(mut, address=event.organizer)]
    pub organizer: SystemAccount<'info>,
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(init, payer=actor, space=8+Dispute::INIT_SPACE,
        seeds=[b"dispute", reservation.key().as_ref()], bump)]
    pub dispute: Account<'info, Dispute>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"reservation", event.key().as_ref(), reservation.participant.as_ref()],
        bump=reservation.bump, has_one=event)]
    pub reservation: Account<'info, Reservation>,
    #[account(mut, seeds=[b"vault", reservation.key().as_ref()], bump=vault.bump,
        has_one=event, has_one=reservation)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address=reservation.participant)]
    pub participant: SystemAccount<'info>,
    #[account(mut, address=event.organizer)]
    pub organizer: SystemAccount<'info>,
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(mut, seeds=[b"dispute", reservation.key().as_ref()], bump=dispute.bump,
        has_one=event, has_one=reservation)]
    pub dispute: Account<'info, Dispute>,
}
#[derive(Accounts)]
pub struct CancelledRefund<'info> {
    #[account(mut, seeds=[b"event", event.organizer.as_ref(), &event.event_id], bump=event.bump)]
    pub event: Account<'info, Event>,
    #[account(mut, seeds=[b"reservation", event.key().as_ref(), reservation.participant.as_ref()],
        bump=reservation.bump, has_one=event)]
    pub reservation: Account<'info, Reservation>,
    #[account(mut, seeds=[b"vault", reservation.key().as_ref()], bump=vault.bump,
        has_one=event, has_one=reservation)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address=reservation.participant)]
    pub participant: SystemAccount<'info>,
    #[account(mut, address=event.organizer)]
    pub organizer: SystemAccount<'info>,
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(mut)]
    pub dispute: Option<Account<'info, Dispute>>,
}
