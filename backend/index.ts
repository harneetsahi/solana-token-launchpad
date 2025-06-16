import "dotenv/config";
import express, { Request, Response, Router } from "express";
import cors from "cors";
import { CarReader } from "@ipld/car";
import * as dagJSON from "@ipld/dag-json";
import * as DID from "@ipld/dag-ucan/did";
import * as Delegation from "@ucanto/core/delegation";
import * as Proof from "@web3-storage/w3up-client/proof";
import * as Signer from "@ucanto/principal/ed25519";
import * as Client from "@web3-storage/w3up-client";
import { StoreMemory } from "@web3-storage/w3up-client/stores/memory";

const KEY = process.env.AGENT_PRIVATE_KEY || "";
const PROOF = process.env.DELEGATION_PROOF || "";

//

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: "*" }));

app.use(express.json());

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

  ///!SECTION

  const backendAgentDID = principal.did(); // Get the DID of this backend agent

  console.log(
    "Backend Agent DID (derived from AGENT_PRIVATE_KEY):",
    backendAgentDID
  );

  const backendClient = await Client.create({ principal, store });

  console.log("Backend Client's Agent DID:", backendClient.agent.did()); // Should match backendAgentDID

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

  console.log("--- Backend DELEGATION_PROOF Details ---");
  console.log("Proof Issuer (Who issued this delegation):", proof.issuer.did());
  console.log(
    "Proof Audience (Who this delegation is for):",
    proof.audience.did()
  );
  // console.log(
  //   "Proof Capabilities:",
  //   proof.capabilities.map((c) => ({ can: c.can, with: c.with }))
  // );
  console.log("Proof Expiration (Unix timestamp):", proof.expiration);

  const archive = await delegation.archive(); // serialize delegation to CAR format
  res.write(archive.ok);
  res.end();
}

//
router.route("/api/w3up-delegation").post(delegationRequestHandler);

app.use(router);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/w3up-delegation`);
});
