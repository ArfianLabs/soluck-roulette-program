import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SoluckRouletteProgram } from "../target/types/soluck_roulette_program";
import { PublicKey } from "@solana/web3.js";
import { createAccountsFilled } from "./utils/utils";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

const LAMPORTS_PER_SOL = 1000000000;

describe("soluck-roulette-program", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  console.log("anchor: ", provider);
  const program = anchor.workspace
    .SoluckRouletteProgram as Program<SoluckRouletteProgram>;
  const connection = program.provider.connection;
  const admin = anchor.web3.Keypair.generate();

  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [roulettePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("roulette")],
    program.programId
  );

  const enterJackpotListener = program.addEventListener(
    "EnterRouletteEvent",
    async (event) => {
      const total_value = new anchor.BN(1);
      const sender = event.from;

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
      console.log("roulettePDAState: ", roulettePDAState);
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
            roulette: roulettePDA,
            auth: admin.publicKey,
          })
          .signers([admin])
          .rpc();

        let configState = await program.account.configData.fetch(configPDA);
        //console.log("configState: ", configState);
      } catch (error) {
        console.log(error);
      }
    } catch (error) {
      console.log(error);
    }
  });

  after(async function () {
    program.removeEventListener(enterJackpotListener);
  });

  it("start roulette", async () => {
    try {
      await program.methods
        .startRoulette()
        .accounts({
          roulette: roulettePDA,
          config: configPDA,
          auth: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      let rouletteState = await program.account.rouletteData.fetch(roulettePDA);
      //console.log("aft rouletteState: ", rouletteState);
    } catch (error) {
      console.log(error);
    }
  });

  it("enter roulette", async () => {
    try {
      const [playerOne, playerTwo] = await createAccountsFilled(program, 2);

      const mint = await createMint(
        program.provider.connection,
        admin,
        admin.publicKey,
        null,
        0
      );

      const fromAta = await createAssociatedTokenAccount(
        connection,
        admin,
        mint,
        playerOne.publicKey
      );

      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), playerOne.publicKey.toBuffer()],
        program.programId
      );

      const toAta = await getOrCreateAssociatedTokenAccount(
        connection,
        playerOne,
        mint,
        escrowPDA,
        true
      );

      const mintAmount = 1;
      await mintTo(
        connection,
        admin,
        mint,
        fromAta,
        admin.publicKey,
        mintAmount
      );

      let playerOneBalance = await connection.getTokenAccountBalance(fromAta);
      console.log("1bal1: ", playerOneBalance.value.uiAmount);
      await program.methods
        .enterRoulette()
        .accounts({
          roulette: roulettePDA,
          escrow: escrowPDA,
          sender: playerOne.publicKey,
          fromAta: fromAta,
          toAta: toAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([playerOne])
        .rpc();
      playerOneBalance = await connection.getTokenAccountBalance(fromAta);
      console.log("2bal0: ", playerOneBalance.value.uiAmount);
      await program.methods
        .claimWinnings()
        .accounts({
          escrow: escrowPDA,
          sender: playerOne.publicKey,
          fromAta: toAta.address,
          toAta: fromAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([playerOne])
        .rpc();
      playerOneBalance = await connection.getTokenAccountBalance(fromAta);
      console.log("3bal1: ", playerOneBalance.value.uiAmount);

      let rouletteState = await program.account.rouletteData.fetch(roulettePDA);
      //console.log("aft rouletteState: ", rouletteState);
    } catch (error) {
      console.log(error);
    }
  });

  it("finish roulette", async () => {
    try {
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
      console.log("aft rouletteState: ", rouletteState);
    } catch (error) {
      console.log(error);
    }
  });
});
