import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoluckRouletteProgram } from "../../target/types/soluck_roulette_program";

const LAMPORTS_PER_SOL = 1000000000;
export const createAccountsFilled = async (program: any, many: number) => {
  const accounts: anchor.web3.Keypair[] = [];

  for (let i = 0; i < many; i++) {
    const kp = anchor.web3.Keypair.generate();
    accounts.push(kp);

    const requestAirdrop = await program.provider.connection.requestAirdrop(
      kp.publicKey,
      LAMPORTS_PER_SOL * 100 // 100 SOL
    );
    const latestBlockHash =
      await program.provider.connection.getLatestBlockhash();
    await program.provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: requestAirdrop,
    });
  }

  return accounts;
};

export const fillAccounts = async (
  program: any,
  accounts: anchor.web3.Keypair[]
) => {
  for (let acc of accounts) {
    const requestAirdrop = await program.provider.connection.requestAirdrop(
      acc.publicKey,
      LAMPORTS_PER_SOL * 100 // 100 SOL
    );
    const latestBlockHash =
      await program.provider.connection.getLatestBlockhash();
    await program.provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: requestAirdrop,
    });
  }
};

export const createAccountsEmpty = async (program: any, many: number) => {
  const accounts: anchor.web3.Keypair[] = [];

  for (let i = 0; i < many; i++) {
    const kp = anchor.web3.Keypair.generate();
    accounts.push(kp);
  }
  return accounts;
};
