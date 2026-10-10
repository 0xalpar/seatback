use anchor_lang::prelude::*;
pub mod state;
// Placeholder only. Never deploy this address; replace with generated program key.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod seatback {
    use super::*;
    pub fn version(_ctx: Context<Version>) -> Result<()> {
        msg!("SeatBack architecture skeleton v0.1.0; monetary instructions unavailable");
        Ok(())
    }
}
#[derive(Accounts)]
pub struct Version {}
