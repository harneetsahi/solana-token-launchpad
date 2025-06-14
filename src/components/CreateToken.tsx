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

import {
  create as createW3upClient,
  type Client,
} from "@web3-storage/w3up-client";

import { Button } from "./Button";
import { InputEl } from "./InputEl";

let w3upClient: Client | undefined;

export const CreateToken = () => {
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [isDisabled, setIsDisabled] = useState(true);
  const [mintTokenAddress, setMintTokenAddress] = useState<null | string>(null);
  const [tsxSignature, setTsxSignature] = useState<null | string>(null);

  // auth
  const [authStep, setAuthStep] = useState<
    "loading" | "input_email" | "check_email" | "ready"
  >("loading");
  const [email, setEmail] = useState<string>("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    imageFile: null as File | null,
    initialSupply: 0,
  });

  const clientRef = useRef<Client | undefined>(undefined);

  useEffect(() => {
    async function initializeClientAndAuth() {
      try {
        setErrorMessage(null);

        const client = await createW3upClient();
        clientRef.current = client;
        w3upClient = client;

        // checking auth
        const currentSpace = await client.currentSpace();

        if (currentSpace) {
          console.log(
            `User storacha space exists: ${
              currentSpace.name || currentSpace.did()
            }`
          );
          setAuthStep("ready");
        } else {
          setAuthStep("input_email");
        }
      } catch (error: any) {
        setErrorMessage(
          `Failed to initialize space: ${error.message || error}`
        );
        setAuthStep("input_email");
      }
    }

    initializeClientAndAuth();
  }, []);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsAuthenticating(true);

    if (!email) {
      setErrorMessage("Please enter your email address.");
      setIsAuthenticating(false);
      return;
    }

    try {
      const client = clientRef.current;
      if (!client) {
        setErrorMessage("Storage client not initialized. Please refresh.");
        setIsAuthenticating(false);
        return;
      }

      const account = await client.login(email as any);
      console.log("Login initiated. Account DID:", account.did());
      setAuthStep("check_email");

      let space = await client.currentSpace();

      if (!space) {
        // @ts-ignore
        space = await client.createSpace("my-solana-token-app-space", {
          account,
        });
        // @ts-ignore
        await client.setCurrentSpace(space.did());
        // @ts-ignore
        console.log(`Created new Storacha space: ${space.name || space.did()}`);
      } else {
        await client.setCurrentSpace(space.did());
        console.log(
          `Using existing Storacha space: ${space.name || space.did()}`
        );
      }

      setAuthStep("ready");
    } catch (error: any) {
      console.error("Auth error:", error);
      setErrorMessage(
        `Authentication failed: ${
          error.message ||
          "Please try again or check your email for a confirmation link."
        }`
      );
      setAuthStep("input_email");
    } finally {
      setIsAuthenticating(false);
    }
  }

  function checkFormDataFiels() {
    const isFormFilled =
      formData.name !== "" &&
      formData.symbol !== "" &&
      formData.imageFile !== null &&
      formData.initialSupply > 0;

    return (
      isFormFilled &&
      authStep === "ready" &&
      !isAuthenticating &&
      !isSubmittingToken
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();

    if (e.target.files && e.target.files[0]) {
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

    console.log(formData);
  }

  useEffect(() => {
    console.log(
      "Current imageFile in state:",
      formData.imageFile?.name || "null"
    );

    setIsDisabled(!checkFormDataFiels());
  }, [formData, authStep, isAuthenticating, isSubmittingToken]);

  /////////////////////////////////////////////////////////////////////////////!SECTION

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  async function handleSubmit() {
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

    setIsSubmittingToken(true);

    try {
      setIsDisabled(true);

      const keypair = Keypair.generate(); // mint pubkey

      const mintAuthority = publicKey;
      const freezeAuthority = publicKey;

      const metadataFileName = `metadata_${Date.now()}.json`;

      const imageCid = await clientRef.current?.uploadFile(formData.imageFile);
      console.log("image cid", imageCid);

      if (!imageCid) throw new Error("Could not get CID for image");

      const imageIpfsUri = `https://${imageCid}.ipfs.w3s.link/`;

      console.log("Uploaded image CID:", imageCid);
      console.log("Image IPFS URI:", imageIpfsUri);

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

      console.log("Uploading JSON metadata to Storacha (IPFS)...");

      const jsonBlob = new Blob([JSON.stringify(offChainMetadata)], {
        type: "application/json",
      });

      const jsonFile = new File([jsonBlob], metadataFileName, {
        type: "application/json",
      });

      const jsonCid = await clientRef.current?.uploadFile(jsonFile);

      if (!jsonCid) throw new Error("Could not get CID for JSON");

      const metadataIpfsUri = `https://${jsonCid}.ipfs.w3s.link/`;
      console.log("Uploaded JSON CID:", jsonCid);
      console.log("Metadata JSON IPFS URI:", metadataIpfsUri);

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

      const chainMetadata = await getTokenMetadata(
        connection,
        keypair.publicKey
      );
      console.log("chain metadata", chainMetadata);

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

  if (authStep === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center mt-10">
        <p className="text-zinc-200">Initializing storage client...</p>
      </div>
    );
  }

  if (authStep === "input_email") {
    return (
      <div className=" flex-1 flex items-center justify-center mt-10 ">
        <div className="w-max mt-10 px-14 py-12 bg-zinc-800 rounded-xl shadow-lg">
          <h1 className="text-xl font-medium text-center text-zinc-200 tracking-wide mb-6">
            Authenticate with Storacha
          </h1>
          <p className="text-zinc-400 text-center mb-4">
            Enter your email to log in or create a new Storacha account. A
            confirmation link will be sent to your inbox.
          </p>

          <form
            onSubmit={handleEmail}
            className="flex flex-col items-center justify-center gap-2"
          >
            <InputEl
              id="email"
              type="email"
              placeholder="Your Email"
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              required
            />
            <Button
              text={isAuthenticating ? "Sending Email..." : "Log In / Sign Up"}
              disabled={isAuthenticating}
              className={`mt-2 w-full ${
                isAuthenticating
                  ? "cursor-not-allowed bg-blue-300"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            />
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-center w-full">
                {errorMessage}
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (authStep === "check_email") {
    return (
      <div className="flex-1 flex items-center justify-center mt-10 ">
        <div className="w-max mt-10 px-14 py-12 bg-zinc-800 rounded-xl shadow-lg">
          <h1 className="text-xl font-medium text-center text-zinc-200 tracking-wide mb-6">
            Check Your Email
          </h1>
          <p className="text-zinc-400 text-center">
            A confirmation link has been sent to{" "}
            <span className="font-bold text-zinc-200">{email}</span>. Please
            click the link in the email to complete your authentication. Once
            confirmed, this page will automatically update.
          </p>
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md text-center w-full">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className=" flex-1 flex items-center justify-center   ">
      <div className="w-max  mt-10 px-14 py-12">
        <h1 className=" text-3xl font-medium text-center text-zinc-200 tracking-wide pb-5 ">
          Solana Token Launchpad
        </h1>

        {errorMessage && (
          <div className="my-2 p-1 bg-red-100 border border-red-400 text-red-700 rounded-xl text-center">
            {errorMessage}
          </div>
        )}

        {mintTokenAddress === null && tsxSignature === null && (
          <form
            action="#"
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
