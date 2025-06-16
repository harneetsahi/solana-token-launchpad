import "dotenv/config";
import express, { Request, Response, Router } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as dagJSON from "@ipld/dag-json";
import * as Delegation from "@ucanto/core/delegation";
import * as Proof from "@web3-storage/w3up-client/proof";
import * as Signer from "@ucanto/principal/ed25519";
import * as Client from "@web3-storage/w3up-client";
import { StoreMemory } from "@web3-storage/w3up-client/stores/memory";

const KEY = process.env.AGENT_PRIVATE_KEY || "";
const PROOF = process.env.DELEGATION_PROOF || "";

//

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
    methods: ["GET", "POST", "DELETE", "PUT"],
  })
);

const router = Router();

async function delegationRequestHandler(req: Request, res: Response) {
  const principal = Signer.parse(KEY);
  const store = new StoreMemory();
  const client = await Client.create({ principal, store });
  const proof = await Proof.parse(PROOF);

  //

  const space = await client.addSpace(proof);

  await client.setCurrentSpace(space.did());

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const delegationReq: any = dagJSON.decode(Buffer.concat(chunks));

  //

  const delegation = await Delegation.delegate({
    issuer: principal,
    audience: { did: () => delegationReq.audience }, // client requesting delegation
    capabilities: delegationReq.caps.map((c: any) => ({
      can: c.can,
      with: space.did(),
    })),
    proofs: client.proofs(
      delegationReq.caps.map((c: any) => ({ can: c.can, with: space.did() }))
    ),
    expiration: Math.floor(Date.now() / 1000) + 60 * 60 * 98,
  });

  const archive = await delegation.archive(); // serialize delegation to CAR format
  res.write(archive.ok);
  res.end();
}

//

router.route("/api/w3up-delegation").post(delegationRequestHandler);

app.use(router);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend", "dist", "index.html"));
  });
}

app.listen(PORT);
