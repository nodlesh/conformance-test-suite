import { Server } from "socket.io";
import { createServer } from "http";
import { AgentController, BaseAgent, CredoAgentAdapter, createAgentConfig } from "@demo/core";
import { AcaPyAgentAdapter } from "@demo/core";
import { v4 as uuidv4 } from "uuid";
import VerifierTestPipeline from "./pipelines/verifierTestPipeline";
import IssueCredentialPipeline from "./pipelines/issueCredentialPipeline";
import { TaskRunnerNode } from "@demo/core/pipeline/src/types";
import path from "path";
import fs from "fs";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const agentId = uuidv4();
const agentPort = Number(process.env.AGENT_PORT) || 3001;
const baseUrl = process.env.BASE_URL || "http://localhost:3001";
function deriveAgentLabel() {
  const referenceAgent = (process.env.REFERENCE_AGENT || "credo").toLowerCase();
  const agentType = referenceAgent === "acapy" ? "ACA-Py" : "Credo";
  return `Ayra CTS Reference ${agentType} Agent`;
}

const agentLabel = deriveAgentLabel();

function shouldUseAcaPy(): boolean {
  const referenceAgent = (process.env.REFERENCE_AGENT || "credo").toLowerCase();
  const overrideAgent = (process.env.REFERENCE_ISSUER_OVERRIDE_AGENT || "auto").toLowerCase();
  const effectiveAgent = (process.env.ISSUER_EFFECTIVE_AGENT || "").toLowerCase();
  const issuerAgent =
    effectiveAgent ||
    (overrideAgent === "auto" ? referenceAgent : overrideAgent);
  return issuerAgent === "acapy";
}

async function buildController(): Promise<AgentController> {
  if (shouldUseAcaPy()) {
    const baseUrl = process.env.ACAPY_CONTROL_URL || "http://localhost:9001";
    const adapter = await AcaPyAgentAdapter.create({ baseUrl, profile: "issuer" });
    return new AgentController(adapter);
  }

  // Default Credo path
  const config = createAgentConfig(agentLabel, agentPort, agentId, baseUrl, [baseUrl]);
  const agent = new BaseAgent(config);
  await agent.init();
  return new AgentController(new CredoAgentAdapter(agent));
}

function loadAyraContext(): any {
  const contextPath =
    process.env.AYRA_CONTEXT_PATH ||
    path.resolve(process.cwd(), "schema", "AyraBusinessCardV1R0.jsonld");
  if (!fs.existsSync(contextPath)) {
    throw new Error(`Ayra context not found at ${contextPath}`);
  }
  const raw = fs.readFileSync(contextPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed["@context"] ?? parsed;
}

function buildAyraCredential(
  issuerDid: string,
  subjectDid: string,
  inlineContext: any,
  overrides?: {
    trustNetworkDid?: string;
    ecosystemId?: string;
  }
) {
  const trustNetworkDid = overrides?.trustNetworkDid ?? "did:web:ayra.forum";
  const ecosystemId = overrides?.ecosystemId ?? "did:web:ecosystem.example";
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      inlineContext,
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    type: ["VerifiableCredential", "AyraBusinessCard"],
    issuer: { id: issuerDid },
    validFrom: "2025-01-01T00:00:00Z",
    validUntil: "2026-01-01T00:00:00Z",
    credentialSubject: {
      id: subjectDid,
      ayra_trust_network_did: trustNetworkDid,
      ayra_assurance_level: 0,
      ayra_card_type: "businesscard",
      ayra_card_version: "1.0.0",
      ayra_card_type_version: "1.0.0",
      ecosystem_id: ecosystemId,
      issuer_id: issuerDid,
      display_name: "Example Holder",
      company_display_name: "Example Corp",
      email: "holder@example.com",
      phone: "+1-555-0100",
      title: "Engineer",
    },
  };
}

// Initialize the server asynchronously
async function initializeServer() {
  try {
    const controller = await buildController();
    const useAcaPy = shouldUseAcaPy();
    const verifierPipeline = useAcaPy
      ? null
      : new VerifierTestPipeline((controller as any).adapter?.agent ?? undefined);
    const issuerPipeline = useAcaPy ? null : new IssueCredentialPipeline(controller);

    io.on("connection", (socket) => {
      console.log("Client connected");

      socket.on("disconnect", () => {
        console.log("Client disconnected");
      });

      socket.on("startVerifierTest", async () => {
        if (!verifierPipeline) {
          socket.emit("connectionError", {
            message: "Verifier pipeline not available for ACA-Py mode.",
          });
          return;
        }
        try {
          const dag = verifierPipeline.dag();
          const nodes = dag.getNodes();
          const connectionNode = nodes.find((node: TaskRunnerNode) => node.task.metadata.name === "Setup Connection");
          if (!connectionNode) {
            throw new Error("Connection node not found");
          }

          await connectionNode.init();
          await connectionNode.run();
          const results = await connectionNode.task.results();
          const invitationUrl = results?.value?.invitationUrl;
          if (!invitationUrl) {
            throw new Error("No invitation URL generated");
          }

          socket.emit("invitationUrl", { url: invitationUrl });
        } catch (error) {
          console.error("Connection error:", error);
          socket.emit("connectionError", {
            message: error instanceof Error ? error.message : "Connection failed",
          });
        }
      });

      socket.on("startConnection", async () => {
        if (useAcaPy) {
          // ACA-Py: create invitation via controller directly
          try {
            const invitation = await controller.establishConnection();
            socket.emit("invitationUrl", { url: invitation.invitationUrl });
          } catch (error) {
            console.error("Connection error:", error);
            socket.emit("connectionError", {
              message: error instanceof Error ? error.message : "Connection failed",
            });
          }
          return;
        }
        try {
          if (!issuerPipeline) {
            throw new Error("Issuer pipeline not initialized");
          }
          const dag = issuerPipeline.dag();
          const nodes = dag.getNodes();
          const connectionNode = nodes.find((node: TaskRunnerNode) => node.task.metadata.name === "Setup Connection");
          if (!connectionNode) {
            throw new Error("Connection node not found");
          }

          await connectionNode.init();
          await connectionNode.run();
          const results = await connectionNode.task.results();
          const invitationUrl = results?.value?.invitationUrl;
          if (!invitationUrl) {
            throw new Error("No invitation URL generated");
          }

          socket.emit("invitationUrl", { url: invitationUrl });
        } catch (error) {
          console.error("Connection error:", error);
          socket.emit("connectionError", {
            message: error instanceof Error ? error.message : "Connection failed",
          });
        }
      });

      socket.on("issueCredential", async () => {
        if (useAcaPy) {
          try {
            const adapter = controller["adapter"] as AcaPyAgentAdapter;
            const inlineContext = loadAyraContext();
            const issuerDid = await adapter.createDidKey("ed25519");
            const fragment = issuerDid.split(":").pop();
            if (!fragment) throw new Error("Could not derive verification method fragment");
            const normalizeEnvValue = (value?: string): string =>
              (value ?? "").split("#")[0].trim();
            const trustNetworkDid =
              normalizeEnvValue(process.env.AYRA_TRUST_NETWORK_DID) || "did:web:ayra.forum";
            const ecosystemId =
              normalizeEnvValue(process.env.AYRA_ECOSYSTEM_DID) || "did:web:ecosystem.example";
            const credential = buildAyraCredential(
              issuerDid,
              "did:key:z6MkhjQjDuoQk7G8hkpuySqQMzuyjaAhmMS6G6Lk2mSuk4zB",
              inlineContext,
              {
                trustNetworkDid,
                ecosystemId,
              }
            );
            const issued: any = await adapter.issueLdpCredential({
              credential,
              options: {
                proofType: "Ed25519Signature2020",
                verificationMethod: `${issuerDid}#${fragment}`,
                proofPurpose: "assertionMethod",
              },
            });
            const verify: any = await adapter.verifyLdpCredential(
              issued.verifiableCredential ?? issued
            );
            const verified = verify.verified === true;
            if (!verified) {
              throw new Error(`Verification failed: ${JSON.stringify(verify)}`);
            }
            socket.emit("credentialStatus", { status: "issued", verified: true });
          } catch (error) {
            console.error("Credential error:", error);
            socket.emit("credentialError", {
              message: error instanceof Error ? error.message : "Credential issuance failed",
            });
          }
          return;
        }
        try {
          if (!issuerPipeline) {
            throw new Error("Issuer pipeline not initialized");
          }
          const dag = issuerPipeline.dag();
          const nodes = dag.getNodes();
          const credentialNode = nodes.find((node: TaskRunnerNode) => node.task.metadata.name === "Issue Credential");
          if (!credentialNode) {
            throw new Error("Credential node not found");
          }

          await credentialNode.init();
          await credentialNode.run();
          const results = await credentialNode.task.results();
          if (!results) {
            throw new Error("No credential result");
          }

          socket.emit("credentialStatus", { status: "issued" });
        } catch (error) {
          console.error("Credential error:", error);
          socket.emit("credentialError", {
            message: error instanceof Error ? error.message : "Credential issuance failed",
          });
        }
      });
    });

    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Start the server
initializeServer(); 
