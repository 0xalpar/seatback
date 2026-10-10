use anchor_lang::prelude::*;
#[error_code]
pub enum SeatBackError {
    #[msg("Invalid or unordered policy")] InvalidPolicy,
    #[msg("Unauthorized signer")] InvalidAuthority,
    #[msg("Event is not open")] EventClosed,
    #[msg("Registered terms are immutable")] TermsLocked,
    #[msg("Seat capacity exceeded")] CapacityExceeded,
    #[msg("Lifetime registration limit reached")] RegistrationLimitReached,
    #[msg("Invalid state or replay")] InvalidState,
    #[msg("Offer has expired or belongs to another wallet")] InvalidOffer,
    #[msg("Outside check-in window")] CheckInWindowClosed,
    #[msg("Dispute window is closed")] DisputeWindowClosed,
    #[msg("Unresolved disputes block settlement")] UnresolvedDisputes,
    #[msg("No remaining payment")] AlreadyPaid,
    #[msg("Checked arithmetic overflow")] Overflow,
    #[msg("Mismatched account or PDA")] InvalidAccount,
    #[msg("Insufficient escrow or rent reserve")] InsufficientEscrow,
}
