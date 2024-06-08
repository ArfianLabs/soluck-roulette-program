import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoluckRouletteProgram } from "../target/types/soluck_roulette_program";
import { PublicKey } from "@solana/web3.js";
import { createAccountsFilled, fillAccounts } from "./utils/utils";
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

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
      try {
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
        let roulettePDAState = await program.account.rouletteData.fetch(
          roulettePDA
        );
        //console.log("YOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO: ", event);
        //console.log("roulettePDAState: ", roulettePDAState);
      } catch (error) {
        console.log("error: ", error);
      }
    }
  );

  const winnerListener = program.addEventListener(
    "WinnerEvent",
    async (event) => {
      try {
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

        let winnerPDAState = await program.account.userRouletteData.fetch(
          winnerPDA
        );
        //console.log("winnerPDAState: ", winnerPDAState);
      } catch (error) {
        console.log("error: ", error);
      }
    }
  );

  before(async function () {
    try {
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
      try {
        await program.methods
          .initConfig()
          .accounts({
            config: configPDA,
            auth: admin.publicKey,
          })
          .signers([admin])
          .rpc();
      } catch (error) {
        console.log(error);
      }
    } catch (error) {
      console.log(error);
    }
  });

  after(async function () {
    program.removeEventListener(enterJackpotListener);
    program.removeEventListener(winnerListener);
  });

  it("start roulette", async () => {
    try {
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
    } catch (error) {
      console.log(error);
    }
  });

  it("enter roulette", async () => {
    try {
      //const [playerOne, playerTwo] = await createAccountsFilled(program, 2);

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

      let playerOneBalance = await connection.getTokenAccountBalance(
        fromAta_player1.address
      );
      //console.log("1bal1: ", playerOneBalance.value.uiAmount);
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
      playerOneBalance = await connection.getTokenAccountBalance(
        fromAta_player1.address
      );

      /*
      tokens = await connection.getTokenAccountsByOwner(roulettePDA, {
        programId: TOKEN_PROGRAM_ID,
      });

      await program.methods
        .claimWinnings()
        .accounts({
          escrow: roulettePDA,
          sender: playerOne.publicKey,
          fromAta: toAta.address,
          toAta: fromAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([playerOne])
        .rpc();
      playerOneBalance = await connection.getTokenAccountBalance(fromAta);
      console.log("3bal1: ", playerOneBalance.value.uiAmount);*/

      let rouletteState = await program.account.rouletteData.fetch(roulettePDA);
      //console.log("aft rouletteState: ", rouletteState);
    } catch (error) {
      console.log(error);
    }
  });

  it("finish roulette", async () => {
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    await delay(3000);
    try {
      let configState = await program.account.configData.fetch(configPDA);

      const rouletteCount = configState.rouletteCount;
      const [roulettePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("roulette"), Buffer.from(rouletteCount.toString())],
        program.programId
      );

      const rng = new anchor.BN(100);
      await program.methods
        .getRandomDecideWinner(rng)
        .accounts({
          roulette: roulettePDA,
          config: configPDA,
          sender: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      let rouletteState = await program.account.rouletteData.fetch(roulettePDA);
      //console.log("aft rouletteState: ", rouletteState);
    } catch (error) {
      console.log(error);
    }
  });

  it("claim winnings roulette", async () => {
    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    await delay(6000);
    try {
      const [userPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("roulette"), playerOne.publicKey.toBuffer()],
        program.programId
      );

      let playerState = await program.account.userRouletteData.fetch(userPDA);
      // console.log("claimer playerState: ", playerState);

      const [roulettePDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("roulette"),
          Buffer.from(playerState.winningRouletteIndexes[0].toString()),
        ],
        program.programId
      );
      let rouletteState = await program.account.rouletteData.fetch(roulettePDA);

      //console.log("  roulettePDA state: ", rouletteState);
      //console.log("  caller : ", playerOne.publicKey);

      const tokensAccountsRoulette = await connection.getTokenAccountsByOwner(
        roulettePDA,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );
      const rouletteTokenAccountKey = tokensAccountsRoulette.value[0].pubkey;
      const rouletteTokenAccount = tokensAccountsRoulette.value[0].account;
      const mintAcc = await getAccount(connection, rouletteTokenAccountKey);
      console.log("rouletteTokenAccountKey: ", rouletteTokenAccountKey);

      console.log("rouletteTokenAccount: ", rouletteTokenAccount);
      console.log("mintAcc: ", mintAcc);

      const playerAta = await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mintAcc.mint,
        playerOne.publicKey
      );
      const toAta = playerAta.address;
      console.log("playerAta: ", playerAta);
      let playerOneBalance = await connection.getTokenAccountBalance(toAta);
      console.log("before: ", playerOneBalance.value.uiAmount);
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
      console.log("after: ", playerOneBalance.value.uiAmount);
    } catch (error) {
      console.log(error);
    }
  });
});
