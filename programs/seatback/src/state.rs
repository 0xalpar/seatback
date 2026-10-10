//! Proposed v1 account layouts; instructions are specified in docs/onchain.md.
//! Fixed size; calculate InitSpace before introducing any allocation instructions.
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Policy {
    pub deposit_lamports: u64,
    pub rule1_deadline: i64,
    pub rule2_deadline: i64,
    pub check_in_opens_at: i64,
    pub check_in_closes_at: i64,
    pub event_starts_at: i64,
    pub event_ends_at: i64,
    pub dispute_seconds: u32,
}
#[account]
#[derive(InitSpace)]
pub struct Event {
    pub version: u8,
    pub organizer: Pubkey,
    pub event_id: [u8; 16],
    pub policy: Policy,
    pub policy_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub gate_authority: Pubkey,
    pub dispute_authority: Pubkey,
    pub capacity: u32,
    pub registration_limit: u32,
    pub registrations_created: u32,
    pub occupied_seats: u32,
    pub held_offers: u32,
    pub outstanding_disputes: u32,
    pub outstanding_lamports: u64,
    pub organizer_allocated_lamports: u64,
    pub status: u8,
    pub terms_locked: bool,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Reservation {
    pub event: Pubkey,
    pub participant: Pubkey,
    pub policy_snapshot: Policy,
    pub policy_hash: [u8; 32],
    pub status: u8,
    pub attended_at: i64,
    pub participant_paid_lamports: u64,
    pub organizer_allocated_lamports: u64,
    pub organizer_paid_lamports: u64,
    pub qr_nonce_hash: [u8; 32],
    pub dispute_open: bool,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub event: Pubkey,
    pub reservation: Pubkey,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct SeatOffer {
    pub event: Pubkey,
    pub participant: Pubkey,
    pub offer_id: [u8; 16],
    pub expires_at: i64,
    pub status: u8,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Scanner {
    pub event: Pubkey,
    pub wallet: Pubkey,
    pub active: bool,
    pub bump: u8,
}
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub event: Pubkey,
    pub reservation: Pubkey,
    pub participant: Pubkey,
    pub evidence_hash: [u8; 32],
    pub opened_at: i64,
    pub resolved_at: i64,
    pub outcome: u8,
    pub bump: u8,
}
