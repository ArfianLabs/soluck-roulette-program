use anchor_lang::prelude::*;
use anchor_spl::token::{
    self, transfer_checked, Token, TokenAccount, Transfer as SplTransfer, TransferChecked,
};
use std::mem::size_of;

declare_id!("EesrPZXx8b6hwLcAMBFtA7RZHyuvs7oFshBoDiK23VBk");

#[program]
pub mod soluck_roulette_program {

    use solana_program::{program::invoke_signed, system_instruction};

    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if config.is_init == true {
            return Err(RouletteErrors::ConfigAlreadyInitialized.into());
        }

        config.is_init = true;
        config.roulette_count = 1;
        config.auth = *ctx.accounts.auth.key;

        Ok(())
    }

    pub fn set_config(ctx: Context<InitConfig>, new_auth: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let signer = ctx.accounts.auth.key;

        if *signer != config.auth {
            return Err(RouletteErrors::NotAuth.into());
        }

        config.auth = new_auth.key();

        Ok(())
    }

    pub fn start_roulette(ctx: Context<InitRoulette>) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer = ctx.accounts.auth.key;

        if *signer != config.auth {
            return Err(RouletteErrors::NotAuth.into());
        }

        let roulette_bump = ctx.bumps.roulette;

        let roulette = &mut ctx.accounts.roulette;
        roulette.status = 1;
        roulette.players = Vec::new();
        roulette.values = Vec::new();
        roulette.bump = roulette_bump;

        Ok(())
    }

    pub fn enter_roulette(ctx: Context<EnterRoulette>) -> Result<()> {
        let roulette = &mut ctx.accounts.roulette;

        if roulette.status != 1 {
            return Err(RouletteErrors::InProgress.into());
        }

        // Initialize if user winning account is not initialized
        let user_winning_account = &mut ctx.accounts.user_winning_account;

        if user_winning_account.winning_roulette_indexes.len() == 0 {
            user_winning_account.winning_roulette_indexes = Vec::new();
        }

        // Transfer SPL Token
        let destination = &ctx.accounts.to_ata;
        let source = &ctx.accounts.from_ata;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.sender;

        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), 1)?;

        roulette.players.push(*ctx.accounts.sender.key);
        roulette.values.push(0);

        emit!(EnterRouletteEvent {
            from: ctx.accounts.sender.key(),
            mint: source.mint,
        });

        Ok(())
    }

    pub fn set_floor_price(
        ctx: Context<SetFloorPrice>,
        address: Pubkey,
        floor_price: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let signer = ctx.accounts.auth.key;

        if *signer != config.auth {
            return Err(RouletteErrors::NotAuth.into());
        }
        let roulette = &mut ctx.accounts.roulette;

        let addresses = &roulette.players;

        if let Some(index) = addresses.iter().position(|&pubkey| pubkey == address) {
            // Update the value at the found index in the amounts vector
            if let Some(existing_amount) = ctx.accounts.roulette.values.get_mut(index) {
                *existing_amount = floor_price;
            }
        }
        Ok(())
    }

    pub fn get_random_decide_winner(ctx: Context<GetRandomDecideWinner>, rng: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer = ctx.accounts.sender.key;

        if *signer != config.auth {
            return Err(RouletteErrors::NotAuth.into());
        }

        let roulette = &mut ctx.accounts.roulette;
        let players = &roulette.players;
        let values = &roulette.values;

        let total_value: u64 = values.iter().sum(); // 10

        let adjusted_winning_number = (rng % total_value) + 1; // 100%10 = 0 + 1 = 1

        let mut cumulative_value: u64 = 0;
        for (i, &value) in values.iter().enumerate() {
            cumulative_value += value; // 10

            if adjusted_winning_number < cumulative_value {
                roulette.winner = players[i];
                break;
            }
        }

        emit!(WinnerEvent {
            winner: roulette.winner,
        });

        Ok(())
    }

    pub fn update_winner_account(ctx: Context<UpdateWinnerAccount>, index: u64) -> Result<()> {
        let config = &ctx.accounts.config;
        let signer = ctx.accounts.sender.key;

        if *signer != config.auth {
            return Err(RouletteErrors::NotAuth.into());
        }

        let user_winning_account = &mut ctx.accounts.user_winning_account;
        let winning_roulette_indexes = &mut user_winning_account.winning_roulette_indexes;

        winning_roulette_indexes.push(index);

        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let roulette = &ctx.accounts.roulette;
        let config = &ctx.accounts.config;
        let winner = roulette.winner;

        if winner != *ctx.accounts.sender.key {
            return Err(RouletteErrors::NotWinner.into());
        }

        let bump = roulette.bump;
        let roulette_count_str = config.roulette_count.to_string();
        let nft_count = roulette.players.len().try_into().unwrap();
        let seeds = &[b"roulette", roulette_count_str.as_bytes(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts: SplTransfer = SplTransfer {
            from: ctx.accounts.from_ata.to_account_info(),
            to: ctx.accounts.to_ata.to_account_info(),
            authority: ctx.accounts.roulette.to_account_info(),
        };
        let token_program = &ctx.accounts.token_program;
        let cpi_program = token_program.to_account_info();

        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
            nft_count,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        seeds = [b"config"],
        bump,
        payer = auth,
        space = size_of::<ConfigData>()*2,
    )]
    pub config: Account<'info, ConfigData>,

    #[account(mut)]
    pub auth: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct ConfigData {
    pub is_init: bool,
    pub roulette_count: u64,
    pub auth: Pubkey,
}

#[derive(Accounts)]
pub struct InitRoulette<'info> {
    #[account(mut)]
    pub config: Account<'info, ConfigData>,

    #[account(
        init,
        seeds = [b"roulette", config.roulette_count.to_string().as_bytes()],
        bump,
        payer = auth,
         space = size_of::<RouletteData>()*2,
    )]
    pub roulette: Account<'info, RouletteData>,

    #[account(mut)]
    pub auth: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFloorPrice<'info> {
    #[account(mut)]
    pub config: Account<'info, ConfigData>,

    #[account(mut)]
    pub roulette: Account<'info, RouletteData>,

    #[account(mut)]
    pub auth: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct RouletteData {
    pub status: u8,
    pub players: Vec<Pubkey>,
    pub values: Vec<u64>,
    pub winner: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct EnterRoulette<'info> {
    #[account(
        init,
        seeds = [b"roulette", sender.key().as_ref()],
        bump,
        payer = sender,
         space = size_of::<UserRouletteData>()*10,
    )]
    pub user_winning_account: Account<'info, UserRouletteData>,

    #[account(mut)]
    pub roulette: Account<'info, RouletteData>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserRouletteData {
    pub winning_roulette_indexes: Vec<u64>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub roulette: Account<'info, RouletteData>,
    #[account(mut)]
    pub config: Account<'info, ConfigData>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: Allow passing additional accounts as remaining accounts
    //pub remaining_accounts: Vec<AccountInfo<'info>>,
    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub to_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetRandomDecideWinner<'info> {
    #[account(mut)]
    pub config: Account<'info, ConfigData>,
    #[account(mut)]
    pub roulette: Account<'info, RouletteData>,
    #[account(mut)]
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateWinnerAccount<'info> {
    #[account(mut)]
    pub config: Account<'info, ConfigData>,
    #[account(mut)]
    pub user_winning_account: Account<'info, UserRouletteData>,
    #[account(mut)]
    pub sender: Signer<'info>,
}

#[account]
pub struct EscrowData {
    pub player: Pubkey,
    pub bump: u8,
}

#[event]
pub struct EnterRouletteEvent {
    from: Pubkey,
    mint: Pubkey,
}

#[event]
pub struct WinnerEvent {
    winner: Pubkey,
}

#[error_code]
pub enum RouletteErrors {
    #[msg("Config already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Not an authority")]
    NotAuth,
    #[msg("Roulette in progress")]
    InProgress,
    #[msg("Not the winner")]
    NotWinner,
}
