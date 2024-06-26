import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoluckRouletteProgram } from "../target/types/soluck_roulette_program";
import { PublicKey } from "@solana/web3.js";
import { fillAccounts } from "./utils/utils";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

const LAMPORTS_PER_SOL = 1000000000;

describe("soluck-roulette-program", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .SoluckRouletteProgram as Program<SoluckRouletteProgram>;

  const connection = program.provider.connection;
  const admin = anchor.web3.Keypair.generate();
  const playerOne = anchor.web3.Keypair.generate();
  const playerTwo = anchor.web3.Keypair.generate();

  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const enterJackpotListener = program.addEventListener(
    "EnterRouletteEvent",
    async (event) => {
      const total_value = new anchor.BN(15);
      const sender = event.from;
      let configState = await program.account.configData.fetch(configPDA);

      const rouletteCount = configState.rouletteCount;
      const [roulettePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("roulette"), Buffer.from(rouletteCount.toString())],
        program.programId
      );
      await program.methods
        .setFloorPrice(sender, total_value)
        .accounts({
          roulette: roulettePDA,
          config: configPDA,
          auth: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    }
  );

  const winnerListener = program.addEventListener(
    "WinnerEvent",
    async (event) => {
      const winner = event.winner;

      let configState = await program.account.configData.fetch(configPDA);

      const index = configState.rouletteCount;

      const [winnerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("roulette"), winner.toBuffer()],
        program.programId
      );

      await program.methods
        .updateWinnerAccount(index)
        .accounts({
          userWinningAccount: winnerPDA,
          config: configPDA,
          sender: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    }
  );

  before(async function () {
    const requestAirdrop = await program.provider.connection.requestAirdrop(
      admin.publicKey,
      LAMPORTS_PER_SOL * 100 // 100 SOL
    );
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: requestAirdrop,
    });

    await program.methods
      .initConfig()
      .accounts({
        config: configPDA,
        signer: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });

  after(async function () {
    program.removeEventListener(enterJackpotListener);
    program.removeEventListener(winnerListener);
  });

  it("start roulette", async () => {
    let configState = await program.account.configData.fetch(configPDA);

    const rouletteCount = configState.rouletteCount;
    const [roulettePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), Buffer.from(rouletteCount.toString())],
      program.programId
    );

    await program.methods
      .startRoulette()
      .accounts({
        config: configPDA,
        roulette: roulettePDA,
        auth: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });

  it("enter roulette", async () => {
    await fillAccounts(program, [playerOne, playerTwo]);

    let configState = await program.account.configData.fetch(configPDA);

    const rouletteCount = configState.rouletteCount;
    const [roulettePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), Buffer.from(rouletteCount.toString())],
      program.programId
    );

    const [user1RoullettePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), playerOne.publicKey.toBuffer()],
      program.programId
    );

    const [user2RoullettePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), playerTwo.publicKey.toBuffer()],
      program.programId
    );

    const mint = await createMint(
      program.provider.connection,
      admin,
      admin.publicKey,
      null,
      0
    );
    const fromAta_player1 = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      playerOne.publicKey
    );

    const fromAta_player2 = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      playerTwo.publicKey
    );

    const toAta = await getOrCreateAssociatedTokenAccount(
      connection,
      playerOne,
      mint,
      roulettePDA,
      true
    );

    const mintAmount = 1;
    await mintTo(
      connection,
      admin,
      mint,
      fromAta_player1.address,
      admin.publicKey,
      mintAmount
    );

    await mintTo(
      connection,
      admin,
      mint,
      fromAta_player2.address,
      admin.publicKey,
      mintAmount
    );
    await program.methods
      .enterRoulette()
      .accounts({
        userWinningAccount: user1RoullettePDA,
        roulette: roulettePDA,
        sender: playerOne.publicKey,
        fromAta: fromAta_player1.address,
        toAta: toAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([playerOne])
      .rpc();

    await program.methods
      .enterRoulette()
      .accounts({
        userWinningAccount: user2RoullettePDA,
        roulette: roulettePDA,
        sender: playerTwo.publicKey,
        fromAta: fromAta_player2.address,
        toAta: toAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([playerTwo])
      .rpc();
  });

  it("finish roulette", async () => {
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    await delay(3000); // Minimal delay for event listener to catch up
    let configState = await program.account.configData.fetch(configPDA);

    const rouletteCount = configState.rouletteCount;
    const [roulettePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), Buffer.from(rouletteCount.toString())],
      program.programId
    );

    // The devnet version of this method is on SoLuck's app repo:
    await program.methods
      .getRandomDecideWinner()
      .accounts({
        roulette: roulettePDA,
        config: configPDA,
        sender: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });

  it("claim winnings roulette", async () => {
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    await delay(6000); // Minimal delay for event listener to catch up
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("roulette"), playerOne.publicKey.toBuffer()],
      program.programId
    );

    let playerState = await program.account.userRouletteData.fetch(userPDA);

    const [roulettePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("roulette"),
        Buffer.from(playerState.winningRouletteIndexes[0].toString()),
      ],
      program.programId
    );

    const tokensAccountsRoulette = await connection.getTokenAccountsByOwner(
      roulettePDA,
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );
    const rouletteTokenAccountKey = tokensAccountsRoulette.value[0].pubkey;
    const mintAcc = await getAccount(connection, rouletteTokenAccountKey);

    const playerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mintAcc.mint,
      playerOne.publicKey
    );
    const toAta = playerAta.address;
    let playerOneBalance = await connection.getTokenAccountBalance(toAta);

    await program.methods
      .claimWinnings()
      .accounts({
        roulette: roulettePDA,
        sender: playerOne.publicKey,
        config: configPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        fromAta: rouletteTokenAccountKey,
        toAta: toAta,
      })
      .signers([playerOne])
      .rpc();

    playerOneBalance = await connection.getTokenAccountBalance(toAta);
  });
});
