use anchor_lang::prelude::*;

declare_id!("EesrPZXx8b6hwLcAMBFtA7RZHyuvs7oFshBoDiK23VBk");

#[program]
pub mod soluck_roulette_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
