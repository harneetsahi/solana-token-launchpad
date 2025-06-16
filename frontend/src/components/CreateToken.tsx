import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  getTokenMetadata,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from "@solana/spl-token";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createInitializeInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";

import * as Delegation from "@ucanto/core/delegation";
import * as Client from "@web3-storage/w3up-client";
import * as dagJSON from "@ipld/dag-json";

import { Button } from "./Button";
import { InputEl } from "./InputEl";

const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000/api/w3up-delegation"
    : "/api/w3up-delegation";

export const CreateToken = () => {
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [isDisabled, setIsDisabled] = useState(true);
  const [mintTokenAddress, setMintTokenAddress] = useState<null | string>(null);
  const [tsxSignature, setTsxSignature] = useState<null | string>(null);

  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [isClientReady, setIsClientReady] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    imageFile: null as File | null,
    initialSupply: 0,
  });

  const clientRef = useRef<any>(undefined);

  useEffect(() => {
    async function initializeDelegatedClient() {
      try {
        setErrorMessage(null);
        setIsClientReady(false);

        const client = await Client.create();

        const caps = [
          { can: "space/blob/add" },
          { can: "upload/add" },
          { can: "space/index/add" },
          { can: "filecoin/offer" },
        ];
        clientRef.current = client;

        const apiUrl = BASE_URL;
        console.log(apiUrl);

        const body = dagJSON.encode({ audience: client.did(), caps });

        const res = await fetch(apiUrl, { method: "POST", body });

        const proof = await Delegation.extract(
          new Uint8Array(await res.arrayBuffer())
        );

        if (!proof.ok) {
          console.log("proof error");
          return;
        }

        const delegatedSpaceDidFromProof = proof.ok.capabilities[0]?.with;

        if (!delegatedSpaceDidFromProof) {
          setErrorMessage("Delegation proof did not specify a space to use.");
          return;
        }

        const space = await clientRef.current.addSpace(proof.ok);

        await clientRef.current.setCurrentSpace(space.did());

        setIsClientReady(true);

        return {
          issuer: client.agent.issuer,
          with: space,
          proofs: [proof.ok],
        };
      } catch (error: any) {
        console.error("Failed to initialize client:", error);
        setErrorMessage(
          `Failed to initialize client: ${error.message || error}.`
        );
        setIsClientReady(false);
      }
    }

    initializeDelegatedClient();
  }, []);

  function checkFormDataFiels() {
    const isFormFilled =
      formData.name !== "" &&
      formData.symbol !== "" &&
      formData.imageFile !== null &&
      formData.initialSupply > 0;

    return isFormFilled && !isSubmittingToken;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (file.size > 300 * 1024) {
        setErrorMessage(
          "Image size cannot exceed 200kb. Please upload a smaller image."
        );
        e.target.value = "";
        setFormData((prevData) => ({
          ...prevData,
          // @ts-ignore
          imageFile: null,
        }));
        return;
      }

      //
      setFormData((prevData) => ({
        ...prevData,
        // @ts-ignore
        imageFile: e.target.files[0],
      }));
    } else {
      setFormData((prevData) => ({
        ...prevData,
        imageFile: null,
      }));
    }
  }

  useEffect(() => {
    setIsDisabled(!checkFormDataFiels());
  }, [formData, isSubmittingToken, isClientReady]);

  /////////////////////////////////////////////////////////////////////////////!SECTION

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setMintTokenAddress(null);
    setTsxSignature(null);

    if (!publicKey) {
      setErrorMessage("Please connect your wallet");
      throw new WalletNotConnectedError();
    }

    if (!formData.imageFile) {
      setErrorMessage("Please upload an image file.");
      return;
    }

    if (!clientRef.current) {
      setErrorMessage("Web3.Storage client is not initialized.");
      setIsSubmittingToken(false);
      setIsDisabled(true);
      return;
    }

    if (!isClientReady) {
      setErrorMessage(
        "Web3.Storage client is not ready. Please wait a moment."
      );
      setIsSubmittingToken(false);
      setIsDisabled(true);
      return;
    }

    //

    setIsSubmittingToken(true);

    try {
      setIsDisabled(true);

      const keypair = Keypair.generate(); // mint pubkey

      const mintAuthority = publicKey;
      const freezeAuthority = publicKey;

      const metadataFileName = `metadata_${Date.now()}.json`;

      const imageCid = await clientRef.current.uploadFile(formData.imageFile);

      if (!imageCid) throw new Error("Could not get CID for image");

      const imageIpfsUri = `https://${imageCid}.ipfs.w3s.link/`;

      const offChainMetadata = {
        name: formData.name,
        symbol: formData.symbol,
        image: imageIpfsUri,
        attributes: [
          { trait_type: "Decimals", value: 9 },
          {
            trait_type: "Initial Supply",
            value: Number(formData.initialSupply).toLocaleString(),
          },
          { trait_type: "Program", value: "Token 2022" },
        ],
        properties: {
          files: [{ uri: imageIpfsUri, type: formData.imageFile?.type }],
          category: "image",
          creators: [{ address: publicKey.toBase58(), share: 100 }],
        },
      };

      const jsonBlob = new Blob([JSON.stringify(offChainMetadata)], {
        type: "application/json",
      });

      const jsonFile = new File([jsonBlob], metadataFileName, {
        type: "application/json",
      });

      console.log("offChainMetadata:", offChainMetadata);
      console.log("jsonBlob.size:", jsonBlob.size);
      console.log("jsonBlob.type:", jsonBlob.type);
      console.log("jsonFile:", jsonFile);

      const jsonCid = await clientRef.current.uploadFile(jsonFile);

      if (!jsonCid) throw new Error("Could not get CID for JSON");

      const metadataIpfsUri = `https://${jsonCid}.ipfs.w3s.link/`;

      const metadata: TokenMetadata = {
        mint: keypair.publicKey,
        name: formData.name,
        symbol: formData.symbol,
        uri: metadataIpfsUri,
        additionalMetadata: [],
      };

      const mintSpace = getMintLen([ExtensionType.MetadataPointer]);

      const metadataSpace = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

      const lamports = await connection.getMinimumBalanceForRentExemption(
        mintSpace + metadataSpace
      );

      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: keypair.publicKey,
        space: mintSpace,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      });

      const initializeMetadatPointerIx =
        createInitializeMetadataPointerInstruction(
          keypair.publicKey,
          publicKey,
          keypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        );

      const initializeMintIx = createInitializeMintInstruction(
        keypair.publicKey,
        9,
        mintAuthority,
        freezeAuthority,
        TOKEN_2022_PROGRAM_ID
      );

      const initializeMetadataIx = createInitializeInstruction({
        mint: keypair.publicKey,
        metadata: keypair.publicKey,
        mintAuthority: publicKey,

        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        programId: TOKEN_2022_PROGRAM_ID,
        updateAuthority: publicKey,
      });

      const initialSupplyBigInt =
        BigInt(Number(formData.initialSupply)) * BigInt(10 ** 9);

      // associated token account

      const associatedTokenAccount = getAssociatedTokenAddressSync(
        keypair.publicKey,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const associatedTokenAcccountIx = createAssociatedTokenAccountInstruction(
        publicKey,
        associatedTokenAccount,
        publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      );

      const mintToIx = createMintToInstruction(
        keypair.publicKey,
        associatedTokenAccount,
        publicKey,
        initialSupplyBigInt,
        [keypair],
        TOKEN_2022_PROGRAM_ID
      );

      const transaction = new Transaction().add(
        createAccountIx,
        initializeMetadatPointerIx,
        initializeMintIx,
        initializeMetadataIx,

        associatedTokenAcccountIx,
        mintToIx
      ); // order of first 3 instructions is important as per Solana docs

      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const signature = await sendTransaction(transaction, connection, {
        signers: [keypair],
      });

      await connection.confirmTransaction(signature, "confirmed");

      await getTokenMetadata(connection, keypair.publicKey);

      setMintTokenAddress(keypair.publicKey.toBase58());
      setTsxSignature(signature);

      setFormData({
        name: "",
        symbol: "",
        imageFile: null,
        initialSupply: 0,
      });
    } catch (error: any) {
      setErrorMessage(
        error.message || "An unknown error occurred during token creation."
      );
    } finally {
      setIsSubmittingToken(false);
      setIsDisabled(true);
    }
  }

  return (
    <div className=" flex items-center justify-center   ">
      <div className="w-max  mt-10 px-14 py-12 flex flex-col items-center">
        <h1 className=" text-3xl font-medium text-center text-zinc-200 tracking-wide pb-5 ">
          Solana Token Launchpad
        </h1>

        {errorMessage && (
          <div className="my-2 py-1 px-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-center">
            {errorMessage}
          </div>
        )}

        {mintTokenAddress === null && tsxSignature === null && (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col items-center justify-center mt-6 gap-2 w-120"
          >
            <InputEl
              id="name"
              max={20}
              type="text"
              placeholder="Name"
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              value={formData.name}
              required
            />

            <InputEl
              max={10}
              id="symbol"
              type="text"
              placeholder="Symbol"
              onChange={(e) =>
                setFormData({ ...formData, symbol: e.target.value })
              }
              value={formData.symbol}
              required
            />

            <InputEl
              placeholder="Upload Image"
              id="image"
              type="file"
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/gif"
              required
              className="block mt-2 w-full shadow-lg rounded-xl text-sm file:bg-[#1F757C] file:border-0 file:me-4 file:py-2 file:px-4 px-0! py-0! cursor-pointer"
            />

            <InputEl
              id="supply"
              type="number"
              placeholder="Initial Supply"
              onChange={(e) =>
                setFormData({
                  ...formData,
                  initialSupply: Number(e.target.value),
                })
              }
              value={formData.initialSupply}
              required
            />

            <Button
              disabled={isDisabled}
              text={!isSubmittingToken ? "Create a token" : "Processing..."}
              icon={
                isSubmittingToken ? (
                  <LoaderCircle className="animate-spin inline-block mr-3  " />
                ) : (
                  ""
                )
              }
              className={`mt-0.5 w-full ${
                isDisabled && "cursor-not-allowed bg-[#c7f28392]"
              }
            `}
            />
          </form>
        )}

        {mintTokenAddress !== null && tsxSignature !== null && (
          <div
            className="w-full p-10 mt-15 flex flex-col items-center border-1  border-[#A2EFE6] rounded-xl text-zinc-100 "
            style={{
              backdropFilter: "blur(68px)",
            }}
          >
            <p className="text-2xl text-zinc-200">
              {" "}
              🎉 Token successfully created 🎉
            </p>
            <a
              href={`https://explorer.solana.com/address/${mintTokenAddress}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className=" hover:underline break-all text-zinc-200 mt-6  "
            >
              {`${mintTokenAddress}`}
            </a>
            <p className="mt-14 text-sm  text-zinc-300/90">
              It may take a moment for the token metadata to fully propagate on
              explorers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
