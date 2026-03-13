// BaseAgent.test.ts

import { BaseAgent } from "./BaseAgent";
import { v4 } from "uuid";
import { indyNetworkConfig } from "./BaseAgent";
import type {
  IndyVdrRegisterSchemaOptions,
  IndyVdrRegisterCredentialDefinitionOptions,
} from "@credo-ts/indy-vdr";

import {
  KeyType,
  TypedArrayEncoder,
  CredentialEventTypes,
  CredentialState,
  CredentialStateChangedEvent,
} from "@credo-ts/core";

// Fixtures for configuration
const basePort = 3019;
//const indicioMediatorURL ="https://us-east2.public.mediator.indiciotech.io/message?oob=eyJAaWQiOiIyNzFmYTZiYS0xYmUxLTQ0ZDEtYjZlZi01ZmM2ODcyZTY4NmYiLCJAdHlwZSI6Imh0dHBzOi8vZGlkY29tbS5vcmcvb3V0LW9mLWJhbmQvMS4xL2ludml0YXRpb24iLCJoYW5kc2hha2VfcHJvdG9jb2xzIjpbImh0dHBzOi8vZGlkY29tbS5vcmcvZGlkZXhjaGFuZ2UvMS4wIl0sImFjY2VwdCI6WyJkaWRjb21tL2FpcDEiLCJkaWRjb21tL2FpcDI7ZW52PXJmYzE5Il0sImxhYmVsIjoiQ2xvdWQgTWVkaWF0b3IiLCJzZXJ2aWNlcyI6W3siaWQiOiIjaW5saW5lIiwidHlwZSI6ImRpZC1jb21tdW5pY2F0aW9uIiwicmVjaXBpZW50S2V5cyI6WyJkaWQ6a2V5Ono2TWtnczZNd1lCM1lnVG9aWlGd2tucUMzNTJjYkh0eEpzaTN6WFpmRjF0MmZOa1QiXSwic2VydmljZUVuZHBvaW50IjoiaHR0cHM6Ly91cy1lYXN0Mi5wdWJsaWMubWVkaWF0b3IuaW5kaWNpb3RlY2guaW8vbWVzc2FnZSJ9XX0==");

const andorMediatorURL =
  "https://mediator.andor.us?c_i=eyJAdHlwZSI6ICJodHRwczovL2RpZGNvbW0ub3JnL2Nvbm5lY3Rpb25zLzEuMC9pbnZpdGF0aW9uIiwgIkBpZCI6ICIzNDQ1MzQ2YS0xMmEwLTQyNjctOWY3MC0zMDdhZWNlMWQ3NzUiLCAibGFiZWwiOiAiTWVkaWF0b3IiLCAicmVjaXBpZW50S2V5cyI6IFsiOVlZV0pjY0tVUkdCNlJWMVpQbkh0blhNbXdncnpMZms3Q2pDQ2JBZHpMdlMiXSwgInNlcnZpY2VFbmRwb2ludCI6ICJodHRwczovL21lZGlhdG9yLmFuZG9yLnVzIn0=";
const indicioMediatorURL =
  "https://public.mediator.indiciotech.io?c_i=eyJAdHlwZSI6ICJkaWQ6c292OkJ6Q2JzTlloTXJqSGlxWkRUVUFTSGc7c3BlYy9jb25uZWN0aW9ucy8xLjAvaW52aXRhdGlvbiIsICJAaWQiOiAiMDVlYzM5NDItYTEyOS00YWE3LWEzZDQtYTJmNDgwYzNjZThhIiwgInNlcnZpY2VFbmRwb2ludCI6ICJodHRwczovL3B1YmxpYy5tZWRpYXRvci5pbmRpY2lvdGVjaC5pbyIsICJyZWNpcGllbnRLZXlzIjogWyJDc2dIQVpxSktuWlRmc3h0MmRIR3JjN3U2M3ljeFlEZ25RdEZMeFhpeDIzYiJdLCAibGFiZWwiOiAiSW5kaWNpbyBQdWJsaWMgTWVkaWF0b3IifQ==";
// Helper function to create agent configuration
const createAgentConfig = (name: string, port: number, id: string) => ({
  name,
  label: `${name} Label`,
  port,
  config: {
    label: name,
    walletConfig: {
      id,
      key: `${id}key`,
    },
    autoUpdateStorageOnStartup: true,
  },
  mediatorURL: andorMediatorURL,
});

// Test fixture identifiers
const agentId = v4();
const holderId = v4();
const issuerId = v4();

// Agent configurations
const verifierConfig = createAgentConfig("Verifier Agent", basePort, agentId);
const holderConfig = createAgentConfig("Holder Agent", basePort + 1, holderId);
const issuerConfig = createAgentConfig("Issuer Agent", basePort + 2, issuerId);

describe("BaseAgent", () => {
  let verifierAgent: BaseAgent;
  let holderAgent: BaseAgent | undefined;
  let issuerAgent: BaseAgent | undefined;

  // Setup verifier agent before each test
  beforeEach(() => {
    verifierAgent = new BaseAgent(verifierConfig);
  });

  // Cleanup agents after each test
  afterEach(async () => {
    // Cleanup holder and issuer agents if initialized
    for (const agent of [holderAgent, issuerAgent, verifierAgent]) {
      if (agent?.agent) {
        try {
          await agent.agent.shutdown();
          await agent.agent.wallet.delete();
        } catch (e) {}
      }
    }
  });

  it("should initialize the verifier agent correctly", async () => {
    await verifierAgent.init();
  });

  it("should generate an Out-of-Band (OOB) URL", async () => {
    await verifierAgent.init();
    const { outOfBandInvitation } =
      await verifierAgent.agent.oob.createInvitation();
    expect(outOfBandInvitation.id).toBeDefined();
  });

  it("should establish connection and request proof. not yet credential", async () => {
    // Initialize holder and issuer agents
    holderAgent = new BaseAgent(holderConfig);
    issuerAgent = new BaseAgent(issuerConfig);

    // Initialize all agents
    await verifierAgent.init();
    await holderAgent.init();
    await issuerAgent.init();

    // Create an out-of-band invitation from verifier
    const outOfBandInvitation =
      await verifierAgent.agent.oob.createInvitation();

    // Holder receives the invitation and connects
    const { connectionRecord: holderConnectionRecord } =
      await holderAgent.agent.oob.receiveInvitation(
        outOfBandInvitation.outOfBandInvitation
      );

    const holderConnection =
      await holderAgent.agent.connections.returnWhenIsConnected(
        holderConnectionRecord!.id
      );

    // Verifier finds the connection by OOB ID and waits for connection
    const [verifierConnectionTmp] =
      await verifierAgent.agent.connections.findAllByOutOfBandId(
        outOfBandInvitation.id
      );
    const verifierConnection =
      await verifierAgent.agent.connections.returnWhenIsConnected(
        verifierConnectionTmp!.id
      );

    if (!verifierConnection) {
      throw new Error("Verifier connection not found");
    }

    // Assertions
    expect(verifierConnection).toBeConnectedWith(holderConnection);
    expect(holderConnection).toBeConnectedWith(verifierConnection);

    // Proof request setup
    const schemaId = "sampleSchemaId";
    const proofAttribute = {
      name: {
        name: "name",
        restrictions: [
          {
            cred_def_id: schemaId,
          },
        ],
      },
    };

    // Request proof from the verifier
    const proofRecord = await verifierAgent.agent.proofs.requestProof({
      protocolVersion: "v2",
      connectionId: verifierConnection.id,
      proofFormats: {
        anoncreds: {
          name: "proof-request",
          version: "1.0",
          requested_attributes: proofAttribute,
        },
      },
    });
    expect(proofRecord).toBeDefined();
  });
  it("should issue connection credential", async () => {
    // Initialize holder and issuer agents
    holderAgent = new BaseAgent(holderConfig);
    issuerAgent = new BaseAgent(issuerConfig);

    await holderAgent.init();
    await issuerAgent.init();

    // Create an out-of-band invitation from verifier
    const outOfBandInvitation = await issuerAgent.agent.oob.createInvitation();

    // Holder receives the invitation and connects
    const { connectionRecord: holderConnectionRecord } =
      await holderAgent.agent.oob.receiveInvitation(
        outOfBandInvitation.outOfBandInvitation
      );

    const holderConnection =
      await holderAgent.agent.connections.returnWhenIsConnected(
        holderConnectionRecord!.id
      );

    // Verifier finds the connection by OOB ID and waits for connection
    const [issuerConnectionTmp] =
      await issuerAgent.agent.connections.findAllByOutOfBandId(
        outOfBandInvitation.id
      );
    const issuerConnection =
      await issuerAgent.agent.connections.returnWhenIsConnected(
        issuerConnectionTmp!.id
      );

    if (!issuerConnection) {
      throw new Error("Verifier connection not found");
    }

    // Assertions
    expect(issuerConnection).toBeConnectedWith(holderConnection);
    expect(holderConnection).toBeConnectedWith(issuerConnection);
    enum RegistryOptions {
      indy = "did:indy",
      cheqd = "did:cheqd",
    }

    const unqualifiedIndyDid = "2jEvRuKmfBJTRa7QowDpNN";
    const cheqdDid = "did:cheqd:testnet:d37eba59-513d-42d3-8f9f-d1df0548b675";
    const indyDid = `did:indy:${indyNetworkConfig.indyNamespace}:${unqualifiedIndyDid}`;

    const did =
      RegistryOptions.indy === RegistryOptions.indy ? indyDid : cheqdDid;
    await issuerAgent.agent.dids.import({
      did,
      overwrite: true,
      privateKeys: [
        {
          keyType: KeyType.Ed25519,
          privateKey: TypedArrayEncoder.fromString(
            "afjdemoverysercure00000000000000"
          ),
        },
      ],
    });
    const anonCredsIssuerId = did;

    console.log("created DID", did);

    const schemaTemplate = {
      name: "Faber College" + v4(),
      version: "1.0.0",
      attrNames: ["name", "degree", "date"],
      issuerId: anonCredsIssuerId,
    };
    const { schemaState } =
      await issuerAgent.agent.modules.anoncreds.registerSchema<IndyVdrRegisterSchemaOptions>(
        {
          schema: schemaTemplate,
          options: {
            endorserMode: "internal",
            endorserDid: anonCredsIssuerId,
          },
        }
      );
    console.log("registered schema");

    console.log("registering crede def");
    const { credentialDefinitionState } =
      await issuerAgent.agent.modules.anoncreds.registerCredentialDefinition<IndyVdrRegisterCredentialDefinitionOptions>(
        {
          credentialDefinition: {
            schemaId: schemaState.schemaId,
            issuerId: anonCredsIssuerId,
            tag: "latest",
          },
          options: {
            supportRevocation: false,
            endorserMode: "internal",
            endorserDid: anonCredsIssuerId,
          },
        }
      );
    console.log("registered credential defintion");
    if (credentialDefinitionState.state !== "finished") {
      throw new Error(
        `Error registering credential definition: ${
          credentialDefinitionState.state === "failed"
            ? credentialDefinitionState.reason
            : "Not Finished"
        }}`
      );
    }
    console.log("credentialDefinitionState", credentialDefinitionState);
    const credentialDefinition = credentialDefinitionState;
    console.log("credentialDefinition", credentialDefinition);
    expect(holderAgent).toBeDefined();

    holderAgent.agent.events.on(
      CredentialEventTypes.CredentialStateChanged,
      async ({ payload }: CredentialStateChangedEvent) => {
        if (payload.credentialRecord.state === CredentialState.OfferReceived) {
          await holderAgent?.agent.credentials.acceptOffer({
            credentialRecordId: payload.credentialRecord.id,
          });
          console.log("stored credential");
        }
      }
    );

    console.log("offering credential");
    issuerAgent.agent.credentials.offerCredential({
      connectionId: issuerConnection.id,
      protocolVersion: "v2",
      credentialFormats: {
        anoncreds: {
          attributes: [
            {
              name: "name",
              value: "Alice Smith",
            },
            {
              name: "degree",
              value: "Computer Science",
            },
            {
              name: "date",
              value: "01/01/2022",
            },
          ],
          credentialDefinitionId: credentialDefinition.credentialDefinitionId,
        },
      },
    });
  });
});
