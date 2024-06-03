import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoluckRouletteProgram } from "../target/types/soluck_roulette_program";
import { PublicKey } from "@solana/web3.js";

const LAMPORTS_PER_SOL = 1000000000;

describe("soluck-roulette-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SoluckRouletteProgram as Program<SoluckRouletteProgram>;
  const connection = program.provider.connection;
  const auth_1 = anchor.web3.Keypair.generate();
  const auth_2 = anchor.web3.Keypair.generate();
  const auth_3 = anchor.web3.Keypair.generate();
  const auth_4 = anchor.web3.Keypair.generate();
  const auth_5 = anchor.web3.Keypair.generate();

  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  before(async function () {
    try {
      const requestAirdrop = await program.provider.connection.requestAirdrop(
        auth_1.publicKey,
        LAMPORTS_PER_SOL * 100 // 100 SOL
      );
      const latestBlockHash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: requestAirdrop,
      });
      try {
        await program.methods
          .initConfig()
          .accounts({
            config: configPDA,
            auth1: auth_1.publicKey,
            auth2: auth_2.publicKey,
            auth3: auth_3.publicKey,
            auth4: auth_4.publicKey,
            auth5: auth_5.publicKey,
          })
          .signers([auth_1])
          .rpc();

        let configState = await program.account.configAccounts.fetch(configPDA);

        console.log("configState: ", configState);
        console.log("configPDA: ", configPDA.toBase58());
      } catch (error) {
        console.log(error);
      }
    } catch (error) {
      console.log(error);
    }
  });

  it("Is initialized!", async () => {});
});
