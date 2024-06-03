use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use std::mem::size_of;

declare_id!("EesrPZXx8b6hwLcAMBFtA7RZHyuvs7oFshBoDiK23VBk");

#[program]
pub mod soluck_roulette_program {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
      let config = &mut ctx.accounts.config;
      
        if config.is_init == true  {
            return Err(RouletteErrors::ConfigAlreadyInitialized.into());
        }

        config.is_init = true;
        config.auth_1 = *ctx.accounts.auth_1.key;
        config.auth_2 = *ctx.accounts.auth_2.key;
        config.auth_3 = *ctx.accounts.auth_3.key;
        config.auth_4 = *ctx.accounts.auth_4.key;
        config.auth_5 = *ctx.accounts.auth_5.key;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        seeds = [b"config"],
        bump,
        payer = auth_1,
        space = size_of::<ConfigAccounts>()*2,
    )]
    pub config: Account<'info, ConfigAccounts>,

    #[account(mut)]
    pub auth_1: Signer<'info>,
    #[account(mut)]
    /// CHECK
    pub auth_2: AccountInfo<'info>,
    #[account(mut)]
      /// CHECK
    pub auth_3: AccountInfo<'info>,
    #[account(mut)]
      /// CHECK
    pub auth_4: AccountInfo<'info>,
    #[account(mut)]
      /// CHECK
    pub auth_5: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}


#[account]
pub struct ConfigAccounts {
    pub is_init: bool,
    pub auth_1: Pubkey,
    pub auth_2: Pubkey,
    pub auth_3: Pubkey,   
    pub auth_4: Pubkey,
    pub auth_5: Pubkey,
}


#[error_code]
pub enum RouletteErrors {
    #[msg("Config already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Not an authority")]
    NotAuth,
}
