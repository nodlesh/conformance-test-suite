import { TaskNode } from "@demo/core/pipeline/src/nodes";
import BaseRunnableTask from "@demo/core/pipeline/src/tasks/baseRunnableTask";
import { DAG } from "@demo/core/pipeline/src/dag";
import { Results } from "@demo/core/pipeline/src/types";
import { AgentController, AcaPyAgentAdapter } from "@demo/core";
import { randomUUID } from "crypto";
import { state as serverState, type TrqpMode, type TrqpPolicyProfile } from "../state";

type ConnectionResult = {
  connectionId: string;
  invitation: unknown;
};

type ProofRequestResult = {
  presentationExchangeId: string;
  connectionId: string;
  request: any;
  demoVerifier?: {
    connectionId: string;
    proofExchangeId?: string;
  };
};

type PresentationResult = {
  presentationExchangeId: string;
  connectionId: string;
  request: any;
  state: string;
  demoVerifier?: {
    connectionId: string;
    proofExchangeId?: string;
  };
};

type TrqpAuthorizationPayload = {
  entity_id: string;
  authority_id: string;
  action: string;
  resource: string;
};

type TrqpRecognitionPayload = {
  entity_id: string;
  authority_id: string;
  action: string;
  resource: string;
  context?: Record<string, unknown>;
};

type TrqpEnforcementContext = {
  trqpMode?: TrqpMode;
  trqpPolicyProfile?: TrqpPolicyProfile;
  issuerDid?: string;
  ecosystemDid?: string;
  trustNetworkDid?: string;
  cardType?: string;
  authorizationPayload?: TrqpAuthorizationPayload;
  recognitionPayload?: TrqpRecognitionPayload;
  trqpBaseUrl?: string;
  adminBaseUrl?: string;
  adminAuthHeader?: string;
  adminAuthToken?: string;
  authorizationEntityId?: number;
  recognitionEntityId?: number;
  authorizationId?: number;
  recognitionId?: number;
  initialAuthorizationIds?: number[];
  initialRecognitionIds?: number[];
  authorizedBefore?: boolean;
  authorizedAfterRemoval?: boolean;
  recognizedBefore?: boolean;
  recognizedAfterRemoval?: boolean;
  run1Connection?: ConnectionResult;
  demoVerifierConnectionId?: string;
  run1Result?: { verified: boolean | null; state: string | null; error?: string };
  run2Result?: { verified: boolean | null; state: string | null; error?: string };
  run1ProofExchangeId?: string;
  run2ProofExchangeId?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const POLL_INTERVAL_MS = 2000;
const VERIFIED_GRACE_MS = (() => {
  const raw = process.env.ACAPY_VERIFIED_GRACE_MS;
  if (!raw) return 2000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 2000;
  return parsed;
})();

function decodeOobFromUrl(oobUrl: string): any {
  const url = new URL(oobUrl.trim());
  const encoded =
    url.searchParams.get("oob") ||
    url.searchParams.get("_oob") ||
    url.searchParams.get("oob64") ||
    url.searchParams.get("c_i") ||
    url.searchParams.get("d_m");
  if (!encoded) {
    throw new Error("No OOB invitation payload found in URL");
  }

  const normalized = encoded.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function fetchJson(url: string, opts: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ACA-Py request failed (${response.status} ${response.statusText}): ${text}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return undefined;
}

const normalizeEnvValue = (value?: string): string => (value ?? "").split("#")[0].trim();

async function readJsonSafe(resp: Response): Promise<{ json: any; raw: string }> {
  const raw = await resp.text().catch(() => "");
  if (!raw) return { json: null, raw: "" };
  try {
    return { json: JSON.parse(raw), raw };
  } catch {
    return { json: null, raw };
  }
}

function summarizeAdminBody(contentType: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return `body=array(len=${parsed.length})`;
      }
      if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed);
        const preview = keys.slice(0, 5).join(",");
        return `body=object(keys=${preview || "none"})`;
      }
      return `body=${String(parsed).slice(0, 120)}`;
    } catch {
      // Fall through to raw summary.
    }
  }
  return `body=${trimmed.slice(0, 120)}`;
}

function extractAuthorizationResult(payload: any): boolean {
  if (Array.isArray(payload)) {
    return payload.some((item) => item?.authorized === true);
  }
  if (payload && typeof payload === "object") {
    return payload.authorized === true;
  }
  return false;
}

function extractRecognitionResult(payload: any): boolean {
  if (Array.isArray(payload)) {
    return payload.some((item) => item?.recognized === true);
  }
  if (payload && typeof payload === "object") {
    return payload.recognized === true;
  }
  return false;
}

function isConsumedInvitationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("previously consumed") ||
    normalized.includes("pairwise requests must be against explicit invitations")
  );
}

async function resolveDidDocument(did: string): Promise<any> {
  const resolverUrl =
    normalizeEnvValue(process.env.NEXT_PUBLIC_DID_RESOLVER_URL) ||
    "https://dev.uniresolver.io/1.0/identifiers";
  const endpoint = `${resolverUrl.replace(/\/$/, "")}/${did}`;
  const resp = await fetch(endpoint);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`DID resolution failed (${did}): ${resp.status} ${resp.statusText} ${text}`);
  }
  const data = await resp.json();
  return data?.didDocument || data;
}

function extractServiceEndpointValue(endpoint: any): string | null {
  if (!endpoint) return null;
  if (typeof endpoint === "string") return endpoint;
  if (typeof endpoint?.uri === "string") return endpoint.uri;
  if (typeof endpoint?.url === "string") return endpoint.url;
  return null;
}

function extractTrqpServiceEndpoint(doc: any): string | null {
  const services = doc?.service;
  if (!Array.isArray(services)) return null;
  for (const service of services) {
    const types = Array.isArray(service?.type) ? service.type : [service?.type];
    const matches = types.some((type: string) => {
      const normalized = String(type || "").toLowerCase();
      return normalized === "trqp" || normalized === "trustregistryservice";
    });
    if (!matches) continue;
    const endpoint = extractServiceEndpointValue(service?.serviceEndpoint);
    if (endpoint) return endpoint;
  }
  return null;
}

async function resolveTrqpEndpoint(ecosystemDid: string): Promise<string> {
  const ecosystemDoc = await resolveDidDocument(ecosystemDid);
  let endpoint = extractTrqpServiceEndpoint(ecosystemDoc);
  if (!endpoint) {
    throw new Error("TRQP endpoint not found in ecosystem DID document");
  }
  if (endpoint.startsWith("did:")) {
    const registryDoc = await resolveDidDocument(endpoint);
    const registryEndpoint = extractTrqpServiceEndpoint(registryDoc);
    if (!registryEndpoint) {
      throw new Error("TRQP endpoint DID did not expose a TRQP service endpoint");
    }
    endpoint = registryEndpoint;
  }
  return endpoint.replace(/\/$/, "");
}

function extractIssuerDid(vc: any): string {
  const issuer = vc?.issuer;
  if (typeof issuer === "string" && issuer.trim()) return issuer;
  if (issuer && typeof issuer.id === "string" && issuer.id.trim()) return issuer.id;
  throw new Error("TRQP mapping failed: issuer DID missing from credential");
}

function extractCredentialSubject(vc: any): any {
  const subject = vc?.credentialSubject;
  if (Array.isArray(subject)) {
    if (subject.length === 0) {
      throw new Error("TRQP mapping failed: credentialSubject array is empty");
    }
    return subject[0];
  }
  if (!subject) {
    throw new Error("TRQP mapping failed: credentialSubject missing");
  }
  return subject;
}

function extractIssuanceTime(vc: any): string | null {
  const issuanceDate = typeof vc?.issuanceDate === "string" ? vc.issuanceDate : "";
  if (issuanceDate) return issuanceDate;
  const validFrom = typeof vc?.validFrom === "string" ? vc.validFrom : "";
  if (validFrom) return validFrom;
  return null;
}

function buildTrqpPayloads(vc: any, profile?: TrqpPolicyProfile): {
  authorizationPayload: TrqpAuthorizationPayload;
  recognitionPayload: TrqpRecognitionPayload;
  issuerDid: string;
  ecosystemDid: string;
  trustNetworkDid: string;
  cardType: string;
} {
  const issuerDid = extractIssuerDid(vc);
  const subject = extractCredentialSubject(vc);
  const authorizationProfile = profile?.authorization;
  const recognitionProfile = profile?.recognition;
  const subjectIssuer = typeof subject?.issuer_id === "string" ? subject.issuer_id : "";
  if (subjectIssuer && subjectIssuer !== issuerDid) {
    throw new Error(
      `TRQP mapping failed: credentialSubject.issuer_id (${subjectIssuer}) does not match issuer (${issuerDid})`
    );
  }
  const ecosystemDid = typeof subject?.ecosystem_id === "string" ? subject.ecosystem_id : "";
  if (!ecosystemDid) {
    throw new Error("TRQP mapping failed: credentialSubject.ecosystem_id missing");
  }
  const trustNetworkDid =
    typeof subject?.ayra_trust_network_did === "string" ? subject.ayra_trust_network_did : "";
  if (!trustNetworkDid) {
    throw new Error("TRQP mapping failed: credentialSubject.ayra_trust_network_did missing");
  }
  const cardType = typeof subject?.ayra_card_type === "string" ? subject.ayra_card_type : "";
  if (!cardType) {
    throw new Error("TRQP mapping failed: credentialSubject.ayra_card_type missing");
  }
  const issuanceTime = extractIssuanceTime(vc);
  const recognitionPayload: TrqpRecognitionPayload = {
    entity_id: ecosystemDid,
    authority_id: trustNetworkDid,
    action: recognitionProfile?.action || "member-of",
    resource: recognitionProfile?.resource || "ayratrustnetwork",
  };
  const recognitionContext: Record<string, unknown> = {};
  if (issuanceTime) {
    recognitionContext.time = issuanceTime;
  }
  if (recognitionProfile?.capability) {
    recognitionContext.capability = recognitionProfile.capability;
  }
  if (Object.keys(recognitionContext).length > 0) {
    recognitionPayload.context = recognitionContext;
  }

  return {
    authorizationPayload: {
      entity_id: issuerDid,
      authority_id: ecosystemDid,
      action: authorizationProfile?.action || "issue",
      resource: authorizationProfile?.resource || `ayracard:${cardType}`,
    },
    recognitionPayload,
    issuerDid,
    ecosystemDid,
    trustNetworkDid,
    cardType,
  };
}

class ReceiveOobViaAcaPyTask extends BaseRunnableTask {
  private adapter: AcaPyAgentAdapter;
  private oobUrl: string;
  private result: ConnectionResult | null = null;
  private controlUrl: string;
  private continueOnFailure: boolean;
  private context?: TrqpEnforcementContext;
  private contextKey?: "run1Connection";

  constructor(
    adapter: AcaPyAgentAdapter,
    oobUrl: string,
    name: string,
    description?: string,
    options?: { continueOnFailure?: boolean; context?: TrqpEnforcementContext; contextKey?: "run1Connection" }
  ) {
    super(name, description);
    this.adapter = adapter;
    this.oobUrl = oobUrl;
    this.controlUrl = adapter.getControlUrl();
    this.continueOnFailure = options?.continueOnFailure ?? false;
    this.context = options?.context;
    this.contextKey = options?.contextKey;
  }

  async prepare(): Promise<void> {
    super.prepare();
    this.addMessage("Ready to accept DIDComm v2 OOB invitation with ACA-Py holder");
  }

  async run(): Promise<void> {
    super.run();
    try {
      if (!this.oobUrl) {
        throw new Error("OOB URL is required");
      }

      const adminUrl = this.adapter.getAdminUrl();
      if (!adminUrl) {
        throw new Error("ACA-Py admin URL missing");
      }

      const invitation = decodeOobFromUrl(this.oobUrl);
      this.addMessage("Decoded OOB invitation");

      let acceptResponse: any;
      const controlReceive = `${this.controlUrl.replace(/\/$/, "")}/connections/receive-invitation`;
      const adminOutOfBandReceive = `${adminUrl.replace(/\/$/, "")}/out-of-band/receive-invitation`;
      const adminConnectionsReceive = `${adminUrl.replace(/\/$/, "")}/connections/receive-invitation`;
      const endpoints = [controlReceive, adminOutOfBandReceive, adminConnectionsReceive];

      let lastError: Error | null = null;
      for (const endpoint of endpoints) {
        try {
          const payload = {
            invitation,
            auto_accept: true,
            // Avoid reusing a previous connection in demo runs; it makes it too easy
            // to send the proof request on a different (older) connection than the one
            // CTS is waiting on.
            use_existing_connection: false,
          };

          acceptResponse = await fetchJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
          this.addMessage(`Invitation posted to ${endpoint}`);
          break;
        } catch (err: any) {
          lastError = err instanceof Error ? err : new Error(String(err));
          this.addMessage(`Failed at ${endpoint}, trying fallback...`);
        }
      }

      if (!acceptResponse && lastError) {
        if (isConsumedInvitationError(lastError)) {
          throw new Error(
            `Invitation appears to be already consumed. Use a fresh verifier invitation URL and retry. Original error: ${lastError.message}`
          );
        }
        throw lastError;
      }

      const connectionId =
        acceptResponse?.connection_id ||
        acceptResponse?.connectionId ||
        acceptResponse?.result?.connection_id ||
        acceptResponse?.result?.connectionId;

      if (!connectionId) {
        throw new Error("ACA-Py did not return a connection id");
      }

      this.addMessage(`Connection created: ${connectionId}, waiting for active state...`);

      const record = await this.waitForConnection(adminUrl, connectionId);
      const state = record?.state || record?.result?.state;
      this.addMessage(`Connection state reached: ${state || "unknown"}`);

      this.result = {
        connectionId,
        invitation,
      };
      if (this.context && this.contextKey) {
        this.context[this.contextKey] = this.result;
      }
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  private async waitForConnection(adminUrl: string, connectionId: string) {
    const control = this.controlUrl.replace(/\/$/, "");
    // Prefer control API wait to block until active
    try {
      const waited = await fetchJson(`${control}/connections/wait`, {
        method: "POST",
        body: JSON.stringify({ connection_id: connectionId, timeout_ms: 120000 }),
      });
      const state = waited?.state || waited?.record?.state;
      if (state === "active" || state === "completed") {
        return waited?.record || waited;
      }
    } catch (err) {
      // Fall back to polling admin if wait failed
      this.addMessage(`control wait failed, polling admin: ${err instanceof Error ? err.message : String(err)}`);
    }

    const deadline = Date.now() + 120_000;
    let last: any;
    while (Date.now() < deadline) {
      last = await fetchJson(`${adminUrl.replace(/\/$/, "")}/connections/${connectionId}`, {
        method: "GET",
      }).catch(() => null);
      const state = last?.state || last?.result?.state;
      if (state === "active" || state === "completed" || state === "response") {
        return last?.result || last;
      }
      await sleep(1500);
    }
    throw new Error("Timed out waiting for ACA-Py connection to become active");
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "ReceiveOobViaAcaPyTask",
      value: this.result,
    };
  }
}

class AwaitProofRequestTask extends BaseRunnableTask {
  private adapter: AcaPyAgentAdapter;
  private demoVerifierAdapter?: AcaPyAgentAdapter;
  private proofResult: ProofRequestResult | null = null;
  private startedAtMs: number | null = null;
  private demoVerifierResult?: { connectionId: string; proofExchangeId?: string };
  private continueOnFailure: boolean;
  private context?: TrqpEnforcementContext;
  private contextKey?: "run1ProofExchangeId" | "run2ProofExchangeId";

  constructor(
    adapter: AcaPyAgentAdapter,
    name: string,
    description?: string,
    demoVerifierAdapter?: AcaPyAgentAdapter,
    options?: {
      continueOnFailure?: boolean;
      context?: TrqpEnforcementContext;
      contextKey?: "run1ProofExchangeId" | "run2ProofExchangeId";
    }
  ) {
    super(name, description);
    this.adapter = adapter;
    this.demoVerifierAdapter = demoVerifierAdapter;
    this.continueOnFailure = options?.continueOnFailure ?? false;
    this.context = options?.context;
    this.contextKey = options?.contextKey;
  }

  async prepare(): Promise<void> {
    super.prepare();
    this.addMessage("Waiting for PE v2 proof request from verifier");
    const enabled = (process.env.ACAPY_VERIFIER_AUTO_SEND_PROOF_REQUEST ?? "false").toLowerCase() === "true";
    if (enabled) {
      this.addMessage(
        this.demoVerifierAdapter
          ? "Demo auto-send proof request: enabled"
          : "Demo auto-send proof request: enabled, but no internal verifier controller is configured"
      );
    } else {
      this.addMessage("Demo auto-send proof request: disabled");
    }
  }

  async run(input?: any): Promise<void> {
    super.run();
    this.startedAtMs = Date.now();
    try {
      const connectionId = input?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId missing from prior step");
      }

      const adminUrl = this.adapter.getAdminUrl();
      if (!adminUrl) {
        throw new Error("ACA-Py admin URL missing");
      }

      await this.maybeSendDemoProofRequest(input);

      const record = await this.waitForProofRequest(adminUrl, connectionId);
      const presentationExchangeId =
        record?.pres_ex_id || record?.presentation_exchange_id || record?.presentation_exchange_id;

      if (!presentationExchangeId) {
        throw new Error("Missing presentation exchange id in proof request");
      }

      const request = record?.by_format?.pres_request?.dif || record?.presentation_request_dict || record;
      this.addMessage("Proof request received (PE v2 / DIF)");

      this.proofResult = {
        presentationExchangeId,
        connectionId,
        request,
        demoVerifier: this.demoVerifierResult,
      };
      if (this.context && this.contextKey) {
        this.context[this.contextKey] = presentationExchangeId;
      }
      if (this.context && this.demoVerifierResult?.connectionId) {
        this.context.demoVerifierConnectionId = this.demoVerifierResult.connectionId;
      }
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  private getRecordTimeMs(record: any): number {
    const raw = record?.updated_at || record?.created_at;
    if (!raw || typeof raw !== "string") return 0;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async maybeSendDemoProofRequest(input: any): Promise<void> {
    const enabled = (process.env.ACAPY_VERIFIER_AUTO_SEND_PROOF_REQUEST ?? "false").toLowerCase() === "true";
    if (!enabled) return;
    if (!this.demoVerifierAdapter) return;

    const invitation: any = input?.invitation;
    const invitationId = invitation?.["@id"] || invitation?.id;
    const fallbackVerifierConnectionId =
      input?.demoVerifier?.connectionId || input?.demoVerifierConnectionId;

    const verifierControl = this.demoVerifierAdapter.getControlUrl().replace(/\/$/, "");
    const verifierAdminUrl = this.demoVerifierAdapter.getAdminUrl()?.replace(/\/$/, "") || null;
    let verifierConnectionId = fallbackVerifierConnectionId;
    if (!verifierConnectionId && invitationId) {
      this.addMessage("Demo auto-send: waiting for verifier connection...");
      const waited = await fetchJson(`${verifierControl}/connections/wait`, {
        method: "POST",
        body: JSON.stringify({ oob_id: invitationId, timeout_ms: 180_000 }),
      }).catch((e) => {
        this.addMessage(
          `Demo auto-send: verifier /connections/wait failed: ${e instanceof Error ? e.message : String(e)}`
        );
        return null;
      });
      verifierConnectionId =
        waited?.connection_id || waited?.record?.connection_id || waited?.record?.connectionId || waited?.connectionId;
    }
    if (!verifierConnectionId) {
      if (!invitationId) {
        this.addMessage("Demo auto-send: missing invitation and verifier connection id; skipping auto-send");
      } else {
        this.addMessage("Demo auto-send: verifier connection not resolved; skipping proof request send");
      }
      return;
    }

    const domain = "https://cts.verifier";
    const ayraSchemaUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld#AyraBusinessCard";
    const ayraTypeUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld";
    const ayraSchemaIdUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.json";
    const vcTypeUri = "https://www.w3.org/2018/credentials#VerifiableCredential";
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const challenge = randomUUID();
      const presentationRequest = {
        dif: {
          options: {
            challenge,
            domain,
          },
          presentation_definition: {
            name: "Ayra Business Card LDP",
            purpose: "Present an Ayra Business Card signed as a Linked Data Proof VC",
            format: { ldp_vp: { proof_type: ["Ed25519Signature2020"] } },
            input_descriptors: [
              {
                id: "ayra-business-card",
                purpose: "Must be an Ayra Business Card with Ed25519Signature2020",
                // Multi-URI schema list with oneof_filter (OR semantics).
                schema: [{ uri: ayraTypeUri }, { uri: vcTypeUri }],
                oneof_filter: true,
                constraints: {
                  fields: [
                    {
                      path: ["$.type[*]", "$.vc.type[*]", "$.credential.type[*]"],
                      filter: { type: "string", const: "AyraBusinessCard" },
                    },
                  ],
                },
              },
            ],
          },
        },
      };
      const proofRequest = {
        connection_id: verifierConnectionId,
        protocol_version: "v2",
        // Keep records around so CTS can poll reliably even if ACA-Py auto-removes.
        auto_remove: false,
        // In demo mode we explicitly verify+ACK on the verifier side; keep the exchange
        // in `presentation-received` until it's verified.
        auto_verify: false,
        comment: `CTS demo verifier proof request (attempt ${attempt}/${maxAttempts})`,
          proof_formats: presentationRequest,
      };

      const response = await fetchJson(`${verifierControl}/proofs/request`, {
        method: "POST",
        body: JSON.stringify(proofRequest),
      }).catch((e) => {
        this.addMessage(`Demo auto-send: proof request failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });

      let proofExchangeId =
        response?.proof_exchange_id ||
        response?.proofExchangeId ||
        response?.record?.proof_exchange_id ||
        response?.record?.presentation_exchange_id ||
        response?.record?.pres_ex_id;

      if (!proofExchangeId) {
        this.addMessage("Demo auto-send: verifier did not return proof_exchange_id; retrying...");
        await sleep(1000);
        continue;
      }

      // Sanity-check that the exchange record exists in verifier ACA-Py. If not, try to resolve
      // by scanning the verifier's records for this connection (and matching the challenge).
      if (verifierAdminUrl) {
        const record = await fetchJson(`${verifierAdminUrl}/present-proof-2.0/records/${proofExchangeId}`, {
          method: "GET",
        }).catch(() => null);
        if (!record) {
          const list = await fetchJson(
            `${verifierAdminUrl}/present-proof-2.0/records?connection_id=${encodeURIComponent(verifierConnectionId)}`,
            { method: "GET" }
          ).catch(() => null);
          const records = list?.results || list?.records || [];
          const match = (records || []).find((r: any) => {
            const dif = r?.by_format?.pres_request?.dif;
            return dif?.options?.challenge === challenge;
          });
          const resolved =
            match?.pres_ex_id || match?.presentation_exchange_id || match?.proof_exchange_id || proofExchangeId;
          if (!match) {
            this.addMessage(
              `Demo auto-send: proof record ${proofExchangeId} not found in verifier admin; retrying...`
            );
            await sleep(1000);
            continue;
          }
          proofExchangeId = resolved;
        }
      }

      this.demoVerifierResult = { connectionId: verifierConnectionId, proofExchangeId };
      this.addMessage(
        `Demo auto-send: proof request sent (verifier connection=${verifierConnectionId}, proof_exchange_id=${proofExchangeId})`
      );
      return;
    }

    this.demoVerifierResult = { connectionId: verifierConnectionId, proofExchangeId: undefined };
    this.addMessage("Demo auto-send: failed to create a verifier proof request after retries; waiting for external verifier");
  }

  private async waitForProofRequest(adminUrl: string, connectionId: string) {
    const deadline = Date.now() + 180_000;
    let last: any;
    const baseUrl = adminUrl.replace(/\/$/, "");
    const startedAtMs = this.startedAtMs ?? Date.now();
    const minTimestampMs = startedAtMs - 2000;
    const excludedExchangeId = this.context?.run1ProofExchangeId || null;
    this.addMessage(
      `AwaitProofRequest filters: minTimestamp=${new Date(minTimestampMs).toISOString()}, excludedExchangeId=${
        excludedExchangeId ?? "none"
      }`
    );
    const preferredStates = [
      "request-received",
      "presentation-request-received",
      "proposal-received",
      "proposal-sent",
      "presentation-received",
      "presentation-sent",
      "done",
    ];

    const extractDifRequest = (record: any) =>
      record?.by_format?.pres_request?.dif ||
      record?.by_format?.pres_request?.presentation_definition ||
      record?.pres_request?.by_format?.pres_request?.dif ||
      record?.presentation_request_dict ||
      record?.presentation_request ||
      record;

    const matchesAyraRequest = (record: any) => {
      const dif = extractDifRequest(record);
      const presentationDefinition = dif?.presentation_definition ?? dif;
      const name = presentationDefinition?.name;
      const inputDescriptors = presentationDefinition?.input_descriptors;
      if (name === "Ayra Business Card LDP") return true;
      if (Array.isArray(inputDescriptors)) {
        return inputDescriptors.some((d: any) => d?.id === "ayra-business-card");
      }
      return false;
    };

    while (Date.now() < deadline) {
      last = await fetchJson(`${baseUrl}/present-proof-2.0/records?connection_id=${encodeURIComponent(connectionId)}`, {
        method: "GET",
      }).catch(() => null);
      const records = (last?.results || last?.records || []).filter(
        (r: any) => !r?.connection_id || r?.connection_id === connectionId
      );
      const sortedRecords = (records || []).sort(
        (a: any, b: any) => this.getRecordTimeMs(b) - this.getRecordTimeMs(a)
      );
      if (sortedRecords.length > 0) {
        const snapshot = sortedRecords.slice(0, 6).map((r: any) => ({
          pres_ex_id: r?.pres_ex_id || r?.presentation_exchange_id,
          state: r?.state,
          updated_at: r?.updated_at,
          created_at: r?.created_at,
        }));
        this.addMessage(`AwaitProofRequest candidates: ${JSON.stringify(snapshot)}`);
      }

      for (const state of preferredStates) {
        const match = sortedRecords.find((r: any) => {
          if (r?.state !== state) return false;
          if (!matchesAyraRequest(r)) return false;
          const presExId = r?.pres_ex_id || r?.presentation_exchange_id;
          if (excludedExchangeId && presExId === excludedExchangeId) return false;
          const recordTime = this.getRecordTimeMs(r);
          if (recordTime && recordTime < minTimestampMs) return false;
          return true;
        });
        if (match) {
          const presExId = match?.pres_ex_id || match?.presentation_exchange_id;
          this.addMessage(`AwaitProofRequest selected exchange ${presExId} (state=${state})`);
          return match;
        }
      }

      await sleep(2000);
    }
    throw new Error("Timed out waiting for proof request from verifier");
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "AwaitProofRequestTask",
      value: this.proofResult,
    };
  }
}

class SendPresentationViaAcaPyTask extends BaseRunnableTask {
  private adapter: AcaPyAgentAdapter;
  private presentationResult: PresentationResult | null = null;
  private continueOnFailure: boolean;

  constructor(
    adapter: AcaPyAgentAdapter,
    name: string,
    description?: string,
    options?: { continueOnFailure?: boolean }
  ) {
    super(name, description);
    this.adapter = adapter;
    this.continueOnFailure = options?.continueOnFailure ?? false;
  }

  async prepare(): Promise<void> {
    super.prepare();
    this.addMessage("Ready to send Ayra card presentation (Ed25519Signature2020, PE v2)");
  }

  private async listW3cCredentialRecords(baseUrl: string): Promise<any[]> {
    const list = await fetchJson(`${baseUrl}/credentials/w3c`, {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => null);

    return (list?.results || list?.records || []) as any[];
  }

  private selectAyraW3cRecordIds(records: any[]): string[] {
    const ayraSchemaUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld#AyraBusinessCard";
    const ayraTypeUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld";
    const ayraTypeFragmentUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld#AyraBusinessCard";
    const ayraSchemaIdUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.json";
    const matching = records.filter((record) => {
      const expandedTypes = record?.expanded_types;
      if (
        Array.isArray(expandedTypes) &&
        (expandedTypes.includes(ayraTypeUri) || expandedTypes.includes(ayraTypeFragmentUri))
      )
        return true;
      const schemaIds = record?.schema_ids;
      if (Array.isArray(schemaIds) && (schemaIds.includes(ayraSchemaUri) || schemaIds.includes(ayraSchemaIdUri)))
        return true;
      const proofTypes = record?.proof_types;
      if (
        Array.isArray(proofTypes) &&
        proofTypes.includes("Ed25519Signature2020")
      )
        return true;
      return false;
    });

    return matching
      .map((record) => record?.record_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  private async findAyraW3cCredentialRecordIds(baseUrl: string): Promise<string[]> {
    const records = await this.listW3cCredentialRecords(baseUrl);
    return this.selectAyraW3cRecordIds(records);
  }

  private async findDifCredentialsForExchange(baseUrl: string, exchangeId: string): Promise<any[]> {
    const resp = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}/credentials`, {
      method: "GET",
    }).catch(() => null);

    const maybeList =
      resp?.results ||
      resp?.records ||
      resp?.result ||
      resp?.credentials ||
      resp?.cred_info ||
      resp;

    if (Array.isArray(maybeList)) return maybeList;
    if (Array.isArray(maybeList?.results)) return maybeList.results;
    if (Array.isArray(maybeList?.records)) return maybeList.records;
    if (Array.isArray(maybeList?.credentials)) return maybeList.credentials;
    return [];
  }

  private selectAyraDifRecordIds(candidates: any[]): string[] {
    const asJson = (v: any) => {
      try {
        return JSON.stringify(v);
      } catch {
        return "";
      }
    };

    const isAyra = (c: any): boolean => {
      const blob = `${asJson(c)} ${asJson(c?.cred_info)} ${asJson(c?.credential)} ${asJson(c?.w3c_credential)}`
        .toLowerCase()
        .replace(/\s+/g, " ");
      return (
        blob.includes("ayrabusinesscard") ||
        blob.includes("ayra business card") ||
        blob.includes("schema.affinidi.io/ayrabusinesscard") ||
        blob.includes("ed25519signature2020")
      );
    };

    const extractId = (c: any): string | null => {
      const id =
        c?.record_id ||
        c?.recordId ||
        c?.cred_id ||
        c?.credId ||
        c?.referent ||
        c?.credential_id ||
        c?.credentialId ||
        c?.cred_info?.referent ||
        c?.cred_info?.record_id ||
        c?.cred_info?.credential_id;
      return typeof id === "string" && id.length > 0 ? id : null;
    };

    const preferred = candidates.filter(isAyra);
    const chosen = preferred.length > 0 ? preferred : candidates;
    return chosen.map(extractId).filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  async run(input?: any): Promise<void> {
    super.run();
    const exchangeId = input?.presentationExchangeId;
    const connectionId = input?.connectionId;
    const request = input?.request;
    const demoVerifier = input?.demoVerifier;
    try {
      if (!exchangeId || !connectionId) {
        throw new Error("presentationExchangeId or connectionId missing");
      }

      const adminUrl = this.adapter.getAdminUrl();
      if (!adminUrl) {
        throw new Error("ACA-Py admin URL missing");
      }
      const baseUrl = adminUrl.replace(/\/$/, "");

      const current = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}`, { method: "GET" }).catch(
        () => null
      );
      const currentState = current?.state || current?.result?.state;

      if (currentState && ["presentation-sent", "done", "abandoned"].includes(currentState)) {
        this.addMessage(`Presentation already ${currentState}; skipping send`);
        this.presentationResult = {
          presentationExchangeId: exchangeId,
          connectionId,
          request,
          state: currentState,
          demoVerifier,
        };
        this.setAccepted();
        this.setCompleted();
        return;
      }

      // ACA-Py requires request-received before we can send a presentation
      if (currentState && currentState !== "request-received") {
        this.addMessage(`Presentation exchange state is ${currentState}; waiting for request-received...`);
        await this.waitForState(baseUrl, exchangeId, ["request-received"]);
      }

      const logPayload = (label: string, payload: unknown) => {
        let serialized: string;
        try {
          serialized = JSON.stringify(payload);
        } catch {
          serialized = String(payload);
        }
        const message = `${label}: ${serialized}`;
        this.addMessage(message);
        console.info(message);
      };

      const difCandidates = await this.findDifCredentialsForExchange(baseUrl, exchangeId);
      logPayload("SendPresentation: dif credentials response", difCandidates);
      const difRecordIds = this.selectAyraDifRecordIds(difCandidates);
      logPayload("SendPresentation: dif record_ids", difRecordIds);
      if (difCandidates.length > 0) {
        this.addMessage(`Found ${difCandidates.length} present-proof credential candidate(s) for this exchange`);
      } else {
        this.addMessage("No present-proof credential candidates returned for this exchange");
      }

      let recordIds: string[] = difRecordIds;
      if (recordIds.length === 0) {
        // Fallback: older ACA-Py versions may not return DIF candidates; try scanning stored W3C credentials directly.
        const w3cRecords = await this.listW3cCredentialRecords(baseUrl);
        logPayload("SendPresentation: w3c credentials response", w3cRecords);
        recordIds = this.selectAyraW3cRecordIds(w3cRecords);
        logPayload("SendPresentation: w3c record_ids", recordIds);
        if (recordIds.length > 0) {
          this.addMessage(`Fallback: found ${recordIds.length} stored W3C credential record(s) for Ayra`);
        }
      }

      const walletRecordId = serverState.lastIssuedWalletRecordId;
      if (walletRecordId) {
        recordIds = [walletRecordId];
        this.addMessage(`Using holder wallet record_id (primary): ${walletRecordId}`);
        console.info(`[SendPresentationViaAcaPyTask] Using holder wallet record_id (primary): ${walletRecordId}`);
        logPayload("SendPresentation: wallet record_id", walletRecordId);
      } else if (serverState.lastIssuedCredentialId) {
        const issuedCredentialId = serverState.lastIssuedCredentialId;
        recordIds = [issuedCredentialId];
        this.addMessage(`Using issued credential_id from issuance flow: ${issuedCredentialId}`);
        console.info(
          `[SendPresentationViaAcaPyTask] Using issued credential_id from issuance flow: ${issuedCredentialId}`
        );
        logPayload("SendPresentation: issued credential_id", issuedCredentialId);
      }

      if (recordIds.length === 0) {
        this.addMessage("No matching credential record ids found; sending empty DIF spec (likely empty presentation)");
      }

      let presentationDid = serverState.holderPresentationDid;
      if (!presentationDid) {
        const didResp = await fetchJson(`${baseUrl}/wallet/did/create`, {
          method: "POST",
          body: JSON.stringify({ key_type: "ed25519" }),
        }).catch(() => null);
        presentationDid = didResp?.did || didResp?.result?.did || didResp?.did_info?.did;
        if (!presentationDid) {
          throw new Error("Internal holder did not return a presentation DID");
        }
        serverState.holderPresentationDid = presentationDid;
        this.addMessage(`Using presentation DID: ${presentationDid}`);
      }

      const sendPayload = recordIds.length
        ? {
            auto_remove: false,
            dif: {
              issuer_id: presentationDid,
              record_ids: { "ayra-business-card": recordIds },
            },
          }
        : {
            auto_remove: false,
            dif: {
              issuer_id: presentationDid,
            },
          };
      logPayload("SendPresentation: send-presentation payload", {
        exchangeId,
        recordIds,
        payload: sendPayload,
      });

      await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}/send-presentation`, {
        method: "POST",
        body: JSON.stringify(sendPayload),
      });
      this.addMessage("Presentation sent via ACA-Py");

      const record = await this.waitForState(baseUrl, exchangeId, ["presentation-sent", "done"]);
      const state = record?.state || record?.result?.state;
      this.presentationResult = {
        presentationExchangeId: exchangeId,
        connectionId,
        request,
        state,
        demoVerifier,
      };
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  private async waitForState(baseUrl: string, exchangeId: string, targetStates: string[]) {
    const deadline = Date.now() + 120_000;
    let last: any;
    while (Date.now() < deadline) {
      last = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}`, { method: "GET" }).catch(() => null);
      const state = last?.state || last?.result?.state;
      if (state && targetStates.includes(state)) {
        return last?.result || last;
      }
      await sleep(1500);
    }
    throw new Error(`Timed out waiting for presentation record ${exchangeId} to reach ${targetStates.join(",")}`);
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "SendPresentationViaAcaPyTask",
      value: this.presentationResult,
    };
  }
}

export class WaitForVerificationViaAcaPyTask extends BaseRunnableTask {
  private adapter: AcaPyAgentAdapter;
  private demoVerifierAdapter?: AcaPyAgentAdapter;
  private verified = false;
  private finalState: string | null = null;
  private continueOnFailure: boolean;
  private expectVerified: boolean;
  private enforceTrqp: boolean;
  private context?: TrqpEnforcementContext;
  private contextKey?: "run1Result" | "run2Result";

  constructor(
    adapter: AcaPyAgentAdapter,
    name: string,
    description?: string,
    demoVerifierAdapter?: AcaPyAgentAdapter,
    options?: {
      continueOnFailure?: boolean;
      expectVerified?: boolean;
      enforceTrqp?: boolean;
      context?: TrqpEnforcementContext;
      contextKey?: "run1Result" | "run2Result";
    }
  ) {
    super(name, description);
    this.adapter = adapter;
    this.demoVerifierAdapter = demoVerifierAdapter;
    this.continueOnFailure = options?.continueOnFailure ?? false;
    this.expectVerified = options?.expectVerified ?? true;
    this.enforceTrqp = options?.enforceTrqp ?? false;
    this.context = options?.context;
    this.contextKey = options?.contextKey;
  }

  async run(input?: any): Promise<void> {
    super.run();
    let errorMessage: string | undefined;
    try {
      const exchangeId = input?.presentationExchangeId;
      if (!exchangeId) {
        throw new Error("presentationExchangeId missing from presentation step");
      }

      const adminUrl = this.adapter.getAdminUrl();
      if (!adminUrl) {
        throw new Error("ACA-Py admin URL missing");
      }
      const baseUrl = adminUrl.replace(/\/$/, "");

      const record = await this.waitForDone(baseUrl, exchangeId, input?.demoVerifier, this.expectVerified);
      const state = record?.state || record?.result?.state;
      const verifiedRaw = record?.verified ?? record?.result?.verified;
      this.verified = verifiedRaw === true || verifiedRaw === "true";
      this.finalState = state ?? null;
      this.addMessage(`Verification state: ${state}, verified=${this.verified}`);

      if (this.expectVerified && !this.verified) {
        throw new Error("Verifier record did not include verified=true");
      }
      if (!this.expectVerified && this.verified) {
        throw new Error("Verifier returned verified=true when TRQP enforcement expected rejection");
      }
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errorMessage = error.message;
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    } finally {
      if (this.context && this.contextKey) {
        this.context[this.contextKey] = {
          verified: this.verified ?? null,
          state: this.finalState ?? null,
          ...(errorMessage ? { error: errorMessage } : {}),
        };
      }
    }
  }

  private async waitForDone(
    baseUrl: string,
    exchangeId: string,
    demoVerifier: { connectionId?: string; proofExchangeId?: string } | undefined,
    expectVerified: boolean
  ) {
    const verifierControl =
      this.demoVerifierAdapter && demoVerifier?.connectionId
        ? this.demoVerifierAdapter.getControlUrl().replace(/\/$/, "")
        : null;
    let verifierProofExchangeId = demoVerifier?.proofExchangeId;
    const verifierConnectionId = demoVerifier?.connectionId;
    let loggedDemoAssist = false;
    let loggedMissingVerifierId = false;
    let verifyTriggered = false;
    let verifyTriggerId: string | null = null;

    const deadline = Date.now() + 180_000;
    const verifiedGraceMs = VERIFIED_GRACE_MS;
    const missingGraceMs = 6_000;
    const summarizeRecord = (record: any): string => {
      if (!record || typeof record !== "object") return "null";
      const summary = {
        state: record?.state || record?.presentation_state,
        verified: record?.verified,
        pres_ex_id: record?.pres_ex_id || record?.presentation_exchange_id,
        proof_exchange_id: record?.proof_exchange_id,
        thread_id: record?.thread_id,
        updated_at: record?.updated_at,
      };
      return JSON.stringify(summary);
    };
    const logSnapshot = (source: string, record: any, extra?: Record<string, unknown>) => {
      const payload = {
        source,
        exchangeId,
        threadId: record?.thread_id ?? null,
        state: record?.state ?? record?.presentation_state ?? null,
        verified: record?.verified ?? null,
        timestamp: new Date().toISOString(),
        ...extra,
      };
      this.addMessage(`Proof exchange update: ${JSON.stringify(payload)}`);
    };
    const normalizeState = (value: any): string | null => {
      if (!value || typeof value !== "string") return null;
      return value.replace(/_/g, "-").toLowerCase();
    };
    const isVerified = (value: any): boolean => value === true || value === "true";

    let last: any;
    let lastHolderRecord: any | null = null;
    let lastHolderSeenAt: number | null = null;
    let lastHolderState: string | null = null;
    let lastHolderVerified: any = null;
    let lastVerifierState: string | null = null;
    let lastVerifierRecord: any | null = null;
    let doneSeenAt: number | null = null;
    let doneSeenSource: "holder" | "verifier" | null = null;
    let negativeDoneSeenAt: number | null = null;
    let negativeDoneSource: "holder" | "verifier" | null = null;
    let verifiedSeenAt: number | null = null;
    let missingSeenAt: number | null = null;
    while (Date.now() < deadline) {
      last = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}`, { method: "GET" }).catch(() => null);
      const holderRecord = last?.result || last;
      const holderState = normalizeState(holderRecord?.state || holderRecord?.result?.state);
      const holderVerified = holderRecord?.verified ?? holderRecord?.result?.verified;
      if (!expectVerified && isVerified(holderVerified)) {
        throw new Error("Verifier reported verified=true when TRQP enforcement expected rejection");
      }
      if (holderRecord) {
        lastHolderRecord = holderRecord;
        lastHolderSeenAt = Date.now();
        if (missingSeenAt) {
          this.addMessage(
            `Proof exchange record reappeared after ${Date.now() - missingSeenAt}ms (exchangeId=${exchangeId})`
          );
          missingSeenAt = null;
        }
        if (holderState && holderState !== lastHolderState) {
          lastHolderState = holderState;
          logSnapshot("holder", holderRecord, { normalizedState: holderState });
        }
        lastHolderVerified = holderVerified;
        if (isVerified(holderVerified)) {
          verifiedSeenAt = Date.now();
          logSnapshot("holder", holderRecord, { normalizedState: holderState, verifiedObserved: true });
          return holderRecord;
        }
        if (holderState === "abandoned") {
          if (!expectVerified) {
            if (negativeDoneSeenAt === null) {
              negativeDoneSeenAt = Date.now();
              negativeDoneSource = "holder";
              this.addMessage(
                `Verifier record reached abandoned (negative check, source=holder, ts=${new Date(
                  negativeDoneSeenAt
                ).toISOString()})`
              );
            }
            return holderRecord;
          }
          const lastSeenAt = lastHolderSeenAt ? new Date(lastHolderSeenAt).toISOString() : "unknown";
          throw new Error(
            `Verifier abandoned proof exchange (lastSeenAt=${lastSeenAt}, lastRecord=${summarizeRecord(
              lastHolderRecord
            )})`
          );
        }
        if (holderState === "done" && !isVerified(holderVerified)) {
          if (!expectVerified) {
            if (negativeDoneSeenAt === null) {
              negativeDoneSeenAt = Date.now();
              negativeDoneSource = "holder";
              this.addMessage(
                `Verifier record reached done (negative check, source=holder, ts=${new Date(
                  negativeDoneSeenAt
                ).toISOString()})`
              );
            }
          } else if (doneSeenAt === null) {
            doneSeenAt = Date.now();
            doneSeenSource = "holder";
            this.addMessage(`Verifier record reached done (source=holder, ts=${new Date(doneSeenAt).toISOString()})`);
          }
        }
      } else if (lastHolderSeenAt) {
        if (!missingSeenAt) {
          missingSeenAt = Date.now();
          this.addMessage(
            `Proof exchange record missing (exchangeId=${exchangeId}, lastState=${lastHolderState ?? "unknown"})`
          );
        }
      }

      if (verifierControl && verifierConnectionId && verifierProofExchangeId) {
        if (!loggedDemoAssist) {
          this.addMessage(
            `Demo verifier assist: polling verifier state (connection_id=${verifierConnectionId}${
              verifierProofExchangeId ? `, proof_exchange_id=${verifierProofExchangeId}` : ""
            })`
          );
          loggedDemoAssist = true;
        }
        if (!verifyTriggered) {
          verifyTriggered = true;
          verifyTriggerId = verifierProofExchangeId;
          this.addMessage(
            `Demo verifier assist: triggering verifier /proofs/verify (proof_exchange_id=${verifierProofExchangeId})`
          );
          void fetchJson(`${verifierControl}/proofs/verify`, {
            method: "POST",
            body: JSON.stringify({
              proof_exchange_id: verifierProofExchangeId,
              connection_id: verifierConnectionId,
              timeout_ms: 120_000,
              enforce_trqp: this.enforceTrqp,
            }),
          })
            .then((resp) => {
              const record = (resp as any)?.record || (resp as any)?.result || resp;
              const verifierState = normalizeState(
                record?.state || record?.presentation_state || (resp as any)?.state || "request-sent"
              );
              const verifierVerified = record?.verified;
              this.addMessage(
                `Demo verifier assist: /proofs/verify response (state=${verifierState || "unknown"}, verified=${String(
                  verifierVerified
                )})`
              );
              if (isVerified(verifierVerified)) {
                verifiedSeenAt = Date.now();
              }
            })
            .catch((e) => {
              this.addMessage(
                `Demo verifier assist: /proofs/verify failed (proof_exchange_id=${verifierProofExchangeId}, error=${
                  e instanceof Error ? e.message : String(e)
                })`
              );
            });
        } else if (verifyTriggerId && verifierProofExchangeId !== verifyTriggerId) {
          this.addMessage(
            `Demo verifier assist: proof_exchange_id updated after verify trigger (from=${verifyTriggerId} to=${verifierProofExchangeId})`
          );
        }
        const verifierResp = await fetchJson(`${verifierControl}/proofs/verify-or-status`, {
          method: "POST",
          body: JSON.stringify({
            proof_exchange_id: verifierProofExchangeId,
            connection_id: verifierConnectionId,
            timeout_ms: 2000,
          }),
        }).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }));

        if ((verifierResp as any)?.__error) {
          this.addMessage(`Demo verifier assist: verifier status error: ${(verifierResp as any).__error}`);
        } else {
          const record = (verifierResp as any)?.record || (verifierResp as any)?.result || verifierResp;
          const resolvedId = (verifierResp as any)?.proof_exchange_id || record?.proof_exchange_id;
          if (resolvedId && resolvedId !== verifierProofExchangeId) {
            verifierProofExchangeId = resolvedId;
            this.addMessage(`Demo verifier assist: resolved proof_exchange_id=${resolvedId}`);
          }
          const verifierState = normalizeState(
            record?.state || record?.presentation_state || (verifierResp as any)?.state || "request-sent"
          );
          if (record) {
            lastVerifierRecord = record;
          }
          if (verifierState && verifierState !== lastVerifierState) {
            lastVerifierState = verifierState;
            logSnapshot("verifier", record, { normalizedState: verifierState });
          }
          const verifierVerified = record?.verified;
          if (isVerified(verifierVerified)) {
            this.addMessage(
              `Demo verifier assist: verifier reports verified=true (state=${verifierState || "unknown"}). Proceeding.`
            );
            verifiedSeenAt = Date.now();
            return { state: "done", verified: true, record };
          }
          if (verifierState === "done" && doneSeenAt === null) {
            if (!expectVerified) {
              if (negativeDoneSeenAt === null) {
                negativeDoneSeenAt = Date.now();
                negativeDoneSource = "verifier";
                this.addMessage(
                  `Verifier record reached done (negative check, source=verifier, ts=${new Date(
                    negativeDoneSeenAt
                  ).toISOString()})`
                );
              }
            } else {
              doneSeenAt = Date.now();
              doneSeenSource = "verifier";
              this.addMessage(
                `Verifier record reached done (source=verifier, ts=${new Date(doneSeenAt).toISOString()})`
              );
            }
          }
          if (verifierState === "abandoned") {
            if (!expectVerified) {
              return lastVerifierRecord || holderRecord;
            }
            const holderSummary = summarizeRecord(lastHolderRecord);
            throw new Error(
              `Verifier abandoned proof exchange (verifierState=abandoned, lastHolderRecord=${holderSummary})`
            );
          }
        }
      } else if (verifierControl && verifierConnectionId && !loggedMissingVerifierId) {
        this.addMessage(
          "Demo verifier assist: proof_exchange_id missing; skipping verifier polling and waiting on holder state"
        );
        loggedMissingVerifierId = true;
      }
      if (missingSeenAt) {
        if (verifiedSeenAt) {
          if (!expectVerified) {
            throw new Error("Verifier reported verified=true when TRQP enforcement expected rejection");
          }
          this.addMessage("Proof exchange record missing after verified=true observed; proceeding.");
          return lastHolderRecord || { state: "done", verified: true };
        }
        const missingForMs = Date.now() - missingSeenAt;
        if (missingForMs >= missingGraceMs) {
          const lastSeenAt = lastHolderSeenAt ? new Date(lastHolderSeenAt).toISOString() : "unknown";
          throw new Error(
            `Verifier record disappeared before verified=true (missingForMs=${missingForMs}, lastSeenAt=${lastSeenAt}, lastState=${
              lastHolderState ?? "unknown"
            }, lastVerified=${String(lastHolderVerified)}) lastRecord=${summarizeRecord(lastHolderRecord)}`
          );
        }
      }
      if (!expectVerified && negativeDoneSeenAt !== null) {
        const waitedMs = Date.now() - negativeDoneSeenAt;
        if (waitedMs >= verifiedGraceMs) {
          this.addMessage(
            `Negative verification grace window elapsed (waitedMs=${waitedMs}, graceMs=${verifiedGraceMs}, doneSource=${
              negativeDoneSource ?? "unknown"
            })`
          );
          return lastVerifierRecord || lastHolderRecord || { state: "done", verified: false };
        }
      }
      if (expectVerified && doneSeenAt !== null && !isVerified(lastHolderVerified)) {
        const waitedMs = Date.now() - doneSeenAt;
        if (waitedMs >= verifiedGraceMs) {
          const doneIso = new Date(doneSeenAt).toISOString();
          const holderSummary = summarizeRecord(lastHolderRecord);
          const verifierSummary = summarizeRecord(lastVerifierRecord);
          throw new Error(
            `Verified grace window elapsed without verified=true (doneSeenAt=${doneIso}, waitedMs=${waitedMs}, graceMs=${verifiedGraceMs}, doneSource=${
              doneSeenSource ?? "unknown"
            }, lastHolderRecord=${holderSummary}, lastVerifierRecord=${verifierSummary})`
          );
        }
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `Timed out waiting for verifier response (holderState=${lastHolderState ?? "unknown"}, verifierState=${
        lastVerifierState ?? "unknown"
      })`
    );
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "WaitForVerificationViaAcaPyTask",
      value: {
        verified: this.verified,
        state: this.finalState,
      },
    };
  }
}

class InputValidationTask extends BaseRunnableTask {
  private errorMessage: string;

  constructor(name: string, description: string, errorMessage: string) {
    super(name, description);
    this.errorMessage = errorMessage;
  }

  async run(): Promise<void> {
    super.run();
    this.addError(this.errorMessage);
    this.setFailed();
    this.setCompleted();
  }
}

class ReuseConnectionTask extends BaseRunnableTask {
  private context: TrqpEnforcementContext;
  private result: any = null;
  private continueOnFailure: boolean;

  constructor(
    context: TrqpEnforcementContext,
    name: string,
    description?: string,
    options?: { continueOnFailure?: boolean }
  ) {
    super(name, description);
    this.context = context;
    this.continueOnFailure = options?.continueOnFailure ?? false;
  }

  async run(): Promise<void> {
    super.run();
    try {
      const connection = this.context.run1Connection;
      if (!connection?.connectionId) {
        throw new Error("Run 1 connection not available for TRQP enforcement");
      }

      this.result = {
        connectionId: connection.connectionId,
        invitation: connection.invitation,
        ...(this.context.demoVerifierConnectionId
          ? {
              demoVerifierConnectionId: this.context.demoVerifierConnectionId,
              demoVerifier: { connectionId: this.context.demoVerifierConnectionId },
            }
          : {}),
      };
      this.addMessage(`Reusing connection ${connection.connectionId} for run 2`);
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "ReuseConnectionTask",
      value: this.result,
    };
  }
}

class PrepareTrqpEnforcementTask extends BaseRunnableTask {
  private adapter: AcaPyAgentAdapter;
  private context: TrqpEnforcementContext;
  private continueOnFailure: boolean;

  constructor(
    adapter: AcaPyAgentAdapter,
    context: TrqpEnforcementContext,
    name: string,
    description?: string,
    options?: { continueOnFailure?: boolean }
  ) {
    super(name, description);
    this.adapter = adapter;
    this.context = context;
    this.continueOnFailure = options?.continueOnFailure ?? false;
  }

  async run(): Promise<void> {
    super.run();
    try {
      const adminBaseUrl = normalizeEnvValue(process.env.TRQP_ADMIN_BASE_URL);
      if (!adminBaseUrl) {
        throw new Error("TRQP admin base URL missing (TRQP_ADMIN_BASE_URL)");
      }
      const adminAuthHeader =
        normalizeEnvValue(process.env.TRQP_ADMIN_AUTH_HEADER) || "Authorization";
      const adminAuthToken = normalizeEnvValue(process.env.TRQP_ADMIN_AUTH_TOKEN);

      this.context.adminBaseUrl = adminBaseUrl.replace(/\/$/, "");
      if (adminAuthToken) {
        this.context.adminAuthHeader = adminAuthHeader;
        this.context.adminAuthToken = adminAuthToken;
      }

      const credential = await this.findAyraCredential();
      const policyProfile = this.context.trqpPolicyProfile || serverState.trqpPolicyProfile;
      const { authorizationPayload, recognitionPayload, issuerDid, ecosystemDid, trustNetworkDid, cardType } =
        buildTrqpPayloads(credential, policyProfile);
      const trqpBaseUrl = await resolveTrqpEndpoint(ecosystemDid);
      const mode: TrqpMode = this.context.trqpMode || "both";
      const runAuthorization = mode === "authorization" || mode === "both";
      const runRecognition = mode === "recognition" || mode === "both";

      this.context.authorizationPayload = authorizationPayload;
      this.context.recognitionPayload = recognitionPayload;
      this.context.issuerDid = issuerDid;
      this.context.ecosystemDid = ecosystemDid;
      this.context.trustNetworkDid = trustNetworkDid;
      this.context.cardType = cardType;
      this.context.trqpBaseUrl = trqpBaseUrl;
      this.addMessage(`TRQP mode selected: ${mode}`);

      this.addMessage(
        `TRQP authorization mapping: entity_id=${authorizationPayload.entity_id} authority_id=${authorizationPayload.authority_id} action=${authorizationPayload.action} resource=${authorizationPayload.resource}`
      );
      this.addMessage(
        `TRQP recognition mapping: entity_id=${recognitionPayload.entity_id} authority_id=${recognitionPayload.authority_id} action=${recognitionPayload.action} resource=${recognitionPayload.resource}`
      );
      const recognitionCapability =
        typeof recognitionPayload.context?.capability === "string"
          ? recognitionPayload.context.capability
          : undefined;
      if (recognitionCapability) {
        this.addMessage(`TRQP recognition capability: ${recognitionCapability}`);
      }
      this.addMessage(`TRQP endpoint resolved: ${trqpBaseUrl}`);

      if (runAuthorization) {
        const authorizationEntity = await this.findEntityByDid(issuerDid);
        const authorization = await this.findAuthorization(
          authorizationPayload.action,
          authorizationPayload.resource
        );
        const authorizationIds = await this.getEntityAuthorizationIds(authorizationEntity.id);
        if (!authorizationIds.includes(authorization.id)) {
          throw new Error(
            `Issuer entity ${issuerDid} is not authorized for ${authorizationPayload.action} ${authorizationPayload.resource}`
          );
        }
        this.context.authorizationEntityId = authorizationEntity.id;
        this.context.authorizationId = authorization.id;
        this.context.initialAuthorizationIds = authorizationIds;

        const authResp = await fetch(`${trqpBaseUrl}/authorization`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authorizationPayload),
        });
        const authBody = await readJsonSafe(authResp);
        if (!authResp.ok) {
          throw new Error(
            `TRQP authorization failed: ${authResp.status} ${authResp.statusText} ${authBody.raw}`
          );
        }
        const authorized = extractAuthorizationResult(authBody.json);
        this.context.authorizedBefore = authorized;
        if (!authorized) {
          throw new Error("TRQP authorization returned authorized=false before run 1");
        }
        this.addMessage("TRQP authorization verified before run 1");
      }

      if (runRecognition) {
        const recognitionEntity = await this.findEntityByDid(recognitionPayload.authority_id);
        const recognition = await this.findRecognition(
          recognitionPayload.action,
          recognitionPayload.resource,
          recognitionCapability
        );
        const recognitionIds = await this.getEntityRecognitionIds(recognitionEntity.id);
        const hasRecognitionBinding = await this.hasEntityRecognitionBinding(
          recognitionEntity.id,
          recognition.id,
          recognitionPayload.entity_id
        );
        if (!recognitionIds.includes(recognition.id) || !hasRecognitionBinding) {
          throw new Error(
            `Authority ecosystem ${recognitionPayload.authority_id} does not recognize ${recognitionPayload.entity_id} for ${recognitionPayload.action} ${recognitionPayload.resource}`
          );
        }
        this.context.recognitionEntityId = recognitionEntity.id;
        this.context.recognitionId = recognition.id;
        this.context.initialRecognitionIds = recognitionIds;

        const recResp = await fetch(`${trqpBaseUrl}/recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recognitionPayload),
        });
        const recBody = await readJsonSafe(recResp);
        if (!recResp.ok) {
          throw new Error(
            `TRQP recognition failed: ${recResp.status} ${recResp.statusText} ${recBody.raw}`
          );
        }
        const recognized = extractRecognitionResult(recBody.json);
        this.context.recognizedBefore = recognized;
        if (!recognized) {
          throw new Error("TRQP recognition returned recognized=false before run 1");
        }
        this.addMessage("TRQP recognition verified before run 1");
      }

      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  private async listW3cCredentialRecords(baseUrl: string): Promise<any[]> {
    const list = await fetchJson(`${baseUrl}/credentials/w3c`, {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => null);
    return (list?.results || list?.records || []) as any[];
  }

  private selectAyraW3cCredential(records: any[]): any | null {
    const ayraSchemaUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld#AyraBusinessCard";
    const ayraTypeUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld";
    const ayraTypeFragmentUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld#AyraBusinessCard";
    const ayraSchemaIdUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.json";
    return (
      records.find((record) => {
        const expandedTypes = record?.expanded_types;
        if (
          Array.isArray(expandedTypes) &&
          (expandedTypes.includes(ayraTypeUri) || expandedTypes.includes(ayraTypeFragmentUri))
        )
          return true;
        const schemaIds = record?.schema_ids;
        if (Array.isArray(schemaIds) && (schemaIds.includes(ayraSchemaUri) || schemaIds.includes(ayraSchemaIdUri)))
          return true;
        const proofTypes = record?.proof_types;
        if (Array.isArray(proofTypes) && proofTypes.includes("Ed25519Signature2020")) return true;
        return false;
      }) ?? null
    );
  }

  private extractCredential(record: any): any | null {
    return (
      record?.credential ||
      record?.cred_value ||
      record?.cred_info?.credential ||
      record?.w3c_credential ||
      record?.record?.credential ||
      null
    );
  }

  private async findAyraCredential(): Promise<any> {
    const adminUrl = this.adapter.getAdminUrl();
    if (!adminUrl) {
      throw new Error("ACA-Py admin URL missing");
    }
    const baseUrl = adminUrl.replace(/\/$/, "");
    const records = await this.listW3cCredentialRecords(baseUrl);
    const record = this.selectAyraW3cCredential(records);
    const credential = record ? this.extractCredential(record) : null;
    if (!credential) {
      throw new Error("No Ayra W3C credential found in holder wallet");
    }
    return credential;
  }

  private buildAdminHeaders(): Record<string, string> {
    if (!this.context.adminAuthToken) return {};
    const header = this.context.adminAuthHeader || "Authorization";
    return { [header]: this.context.adminAuthToken };
  }

  private async fetchAdminJson(path: string, init?: RequestInit): Promise<any> {
    if (!this.context.adminBaseUrl) {
      throw new Error("TRQP admin base URL missing");
    }
    const method = (init?.method || "GET").toUpperCase();
    const url = `${this.context.adminBaseUrl}${path}`;
    const bodySize = typeof init?.body === "string" ? init.body.length : 0;
    this.addMessage(`TRQP admin request: ${method} ${url}${bodySize ? ` body_len=${bodySize}` : ""}`);
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.buildAdminHeaders(),
        ...(init?.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text().catch(() => "");
    const summary = summarizeAdminBody(contentType, rawBody);
    this.addMessage(
      `TRQP admin response: ${response.status} ${response.statusText}${summary ? ` ${summary}` : ""}`
    );
    if (!response.ok) {
      throw new Error(`TRQP admin request failed (${response.status} ${response.statusText}): ${rawBody}`);
    }
    if (contentType.includes("application/json")) {
      return rawBody ? JSON.parse(rawBody) : undefined;
    }
    return undefined;
  }

  private async findEntityByDid(did: string): Promise<{ id: number; entity_did: string }> {
    const entities = await this.fetchAdminJson("/entities");
    const list = Array.isArray(entities) ? entities : entities?.results || entities?.records || [];
    const match = list.find((entry: any) => entry?.entity_did === did);
    if (!match || !Number.isFinite(match.id)) {
      throw new Error(`Issuer entity not found in TR admin: ${did}`);
    }
    return { id: match.id, entity_did: match.entity_did };
  }

  private async findAuthorization(action: string, resource: string): Promise<{ id: number }> {
    const auths = await this.fetchAdminJson("/authorizations");
    const list = Array.isArray(auths) ? auths : auths?.results || auths?.records || [];
    const match = list.find((entry: any) => entry?.action === action && entry?.resource === resource);
    if (!match || !Number.isFinite(match.id)) {
      throw new Error(`Authorization not found in TR admin: ${action} ${resource}`);
    }
    return { id: match.id };
  }

  private capabilityMatches(entry: any, capability?: string): boolean {
    if (!capability) return true;
    const candidates = [
      entry?.capability,
      entry?.scope,
      entry?.capability_scope,
      entry?.context?.capability,
      entry?.metadata?.capability,
    ];
    return candidates.some((candidate) => typeof candidate === "string" && candidate === capability);
  }

  private async findRecognition(
    action: string,
    resource: string,
    capability?: string
  ): Promise<{ id: number }> {
    const recognitions = await this.fetchAdminJson("/recognitions");
    const list = Array.isArray(recognitions)
      ? recognitions
      : recognitions?.results || recognitions?.records || [];
    const match = list.find(
      (entry: any) =>
        entry?.action === action &&
        entry?.resource === resource &&
        this.capabilityMatches(entry, capability)
    );
    if (!match || !Number.isFinite(match.id)) {
      if (capability) {
        throw new Error(
          `Recognition not found in TR admin: ${action} ${resource} (capability=${capability})`
        );
      }
      throw new Error(`Recognition not found in TR admin: ${action} ${resource}`);
    }
    return { id: match.id };
  }

  private collectRelationIds(
    payload: any,
    embeddedKey: "authorizations" | "recognitions",
    linkKey: "authorization_id" | "recognition_id"
  ): number[] {
    if (!payload) return [];
    const toId = (value: any): number | null => {
      if (Number.isFinite(value)) return value;
      const nestedId = value?.id;
      if (Number.isFinite(nestedId)) return nestedId;
      const linkId = value?.[linkKey];
      if (Number.isFinite(linkId)) return linkId;
      return null;
    };

    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.[embeddedKey])
        ? payload[embeddedKey]
        : Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload?.records)
            ? payload.records
            : [];

    return list
      .map((item: any) => toId(item))
      .filter((id: number | null): id is number => Number.isFinite(id));
  }

  private async getEntityAuthorizationIds(entityId: number): Promise<number[]> {
    const entityDetails = await this.fetchAdminJson(`/entities/${entityId}`);
    const embeddedIds = this.collectRelationIds(entityDetails, "authorizations", "authorization_id");
    const hasEmbeddedAuthorizations =
      !!entityDetails &&
      typeof entityDetails === "object" &&
      Object.prototype.hasOwnProperty.call(entityDetails, "authorizations");
    if (hasEmbeddedAuthorizations) {
      return embeddedIds;
    }
    try {
      const relationRows = await this.fetchAdminJson(`/entities/${entityId}/authorizations`);
      return this.collectRelationIds(relationRows, "authorizations", "authorization_id");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (routeMissing) {
        return embeddedIds;
      }
      throw err;
    }
  }

  private async getEntityRecognitionIds(entityId: number): Promise<number[]> {
    const entityDetails = await this.fetchAdminJson(`/entities/${entityId}`);
    const embeddedIds = this.collectRelationIds(entityDetails, "recognitions", "recognition_id");
    const hasEmbeddedRecognitions =
      !!entityDetails &&
      typeof entityDetails === "object" &&
      Object.prototype.hasOwnProperty.call(entityDetails, "recognitions");
    if (hasEmbeddedRecognitions) {
      return embeddedIds;
    }
    try {
      const relationRows = await this.fetchAdminJson(`/entities/${entityId}/recognitions`);
      return this.collectRelationIds(relationRows, "recognitions", "recognition_id");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (routeMissing) {
        return embeddedIds;
      }
      throw err;
    }
  }

  private async hasEntityRecognitionBinding(
    entityId: number,
    recognitionId: number,
    recognizedRegistryDid: string
  ): Promise<boolean> {
    try {
      const relationRows = await this.fetchAdminJson(`/entities/${entityId}/recognitions`);
      const list = Array.isArray(relationRows)
        ? relationRows
        : relationRows?.results || relationRows?.records || [];
      return list.some((row: any) => {
        const rowRecognitionId = row?.recognition_id ?? row?.recognition?.id ?? row?.id;
        return (
          Number.isFinite(rowRecognitionId) &&
          Number(rowRecognitionId) === recognitionId &&
          row?.recognized_registry_did === recognizedRegistryDid &&
          row?.recognized !== false
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (routeMissing) {
        const ids = await this.getEntityRecognitionIds(entityId);
        return ids.includes(recognitionId);
      }
      throw err;
    }
  }
}

class DisableTrqpAuthorizationTask extends BaseRunnableTask {
  private context: TrqpEnforcementContext;
  private continueOnFailure: boolean;

  constructor(context: TrqpEnforcementContext, name: string, description?: string, options?: { continueOnFailure?: boolean }) {
    super(name, description);
    this.context = context;
    this.continueOnFailure = options?.continueOnFailure ?? false;
  }

  async run(): Promise<void> {
    super.run();
    try {
      const adminBaseUrl = this.context.adminBaseUrl;
      const trqpBaseUrl = this.context.trqpBaseUrl;
      const mode: TrqpMode = this.context.trqpMode || "both";
      const runAuthorization = mode === "authorization" || mode === "both";
      const runRecognition = mode === "recognition" || mode === "both";
      if (!adminBaseUrl || !trqpBaseUrl) {
        throw new Error("TRQP enforcement context incomplete; cannot disable policy bindings");
      }
      this.addMessage(`TRQP mode selected: ${mode}`);

      if (runAuthorization) {
        const entityId = this.context.authorizationEntityId;
        const authorizationId = this.context.authorizationId;
        const payload = this.context.authorizationPayload;
        if (!entityId || !authorizationId || !payload) {
          throw new Error("TRQP authorization context incomplete; cannot disable authorization");
        }

        await this.fetchAdminJson(`/entities/${entityId}/authorizations/${authorizationId}`, { method: "DELETE" });
        this.addMessage(`TRQP admin: removed authorization ${authorizationId} from entity ${entityId}`);

        const authResp = await fetch(`${trqpBaseUrl}/authorization`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const authBody = await readJsonSafe(authResp);
        if (!authResp.ok) {
          throw new Error(
            `TRQP authorization failed after removal: ${authResp.status} ${authResp.statusText} ${authBody.raw}`
          );
        }
        const authorized = extractAuthorizationResult(authBody.json);
        this.context.authorizedAfterRemoval = authorized;
        if (authorized) {
          throw new Error("TRQP authorization still returns authorized=true after removal");
        }
        this.addMessage("TRQP authorization now returns authorized=false");
      }

      if (runRecognition) {
        const entityId = this.context.recognitionEntityId;
        const recognitionId = this.context.recognitionId;
        const payload = this.context.recognitionPayload;
        if (!entityId || !recognitionId || !payload) {
          throw new Error("TRQP recognition context incomplete; cannot disable recognition");
        }
        const recognizedRegistryDid = payload.entity_id;
        if (!recognizedRegistryDid) {
          throw new Error("TRQP recognition payload missing entity_id; cannot disable recognition");
        }

        await this.fetchAdminJson(
          `/entities/${entityId}/recognitions/${recognitionId}?recognized_registry_did=${encodeURIComponent(
            recognizedRegistryDid
          )}`,
          {
            method: "DELETE",
          }
        );
        this.addMessage(`TRQP admin: removed recognition ${recognitionId} from entity ${entityId}`);

        const recResp = await fetch(`${trqpBaseUrl}/recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const recBody = await readJsonSafe(recResp);
        if (!recResp.ok) {
          throw new Error(
            `TRQP recognition failed after removal: ${recResp.status} ${recResp.statusText} ${recBody.raw}`
          );
        }
        const recognized = extractRecognitionResult(recBody.json);
        this.context.recognizedAfterRemoval = recognized;
        if (recognized) {
          throw new Error("TRQP recognition still returns recognized=true after removal");
        }
        this.addMessage("TRQP recognition now returns recognized=false");
      }

      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      if (!this.continueOnFailure) {
        throw error;
      }
    }
  }

  private buildAdminHeaders(): Record<string, string> {
    if (!this.context.adminAuthToken) return {};
    const header = this.context.adminAuthHeader || "Authorization";
    return { [header]: this.context.adminAuthToken };
  }

  private async fetchAdminJson(path: string, init?: RequestInit): Promise<any> {
    if (!this.context.adminBaseUrl) {
      throw new Error("TRQP admin base URL missing");
    }
    const method = (init?.method || "GET").toUpperCase();
    const url = `${this.context.adminBaseUrl}${path}`;
    const bodySize = typeof init?.body === "string" ? init.body.length : 0;
    this.addMessage(`TRQP admin request: ${method} ${url}${bodySize ? ` body_len=${bodySize}` : ""}`);
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.buildAdminHeaders(),
        ...(init?.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text().catch(() => "");
    const summary = summarizeAdminBody(contentType, rawBody);
    this.addMessage(
      `TRQP admin response: ${response.status} ${response.statusText}${summary ? ` ${summary}` : ""}`
    );
    if (!response.ok) {
      throw new Error(`TRQP admin request failed (${response.status} ${response.statusText}): ${rawBody}`);
    }
    if (contentType.includes("application/json")) {
      return rawBody ? JSON.parse(rawBody) : undefined;
    }
    return undefined;
  }
}

class RestoreTrqpAuthorizationTask extends BaseRunnableTask {
  private context: TrqpEnforcementContext;

  constructor(context: TrqpEnforcementContext, name: string, description?: string) {
    super(name, description);
    this.context = context;
  }

  async run(): Promise<void> {
    super.run();
    try {
      const adminBaseUrl = this.context.adminBaseUrl;
      const trqpBaseUrl = this.context.trqpBaseUrl;
      const mode: TrqpMode = this.context.trqpMode || "both";
      const runAuthorization = mode === "authorization" || mode === "both";
      const runRecognition = mode === "recognition" || mode === "both";
      if (!adminBaseUrl || !trqpBaseUrl) {
        throw new Error("TRQP enforcement context incomplete; cannot restore policy bindings");
      }
      this.addMessage(`TRQP mode selected: ${mode}`);

      if (runAuthorization) {
        const entityId = this.context.authorizationEntityId;
        const authorizationId = this.context.authorizationId;
        const payload = this.context.authorizationPayload;
        if (!entityId || !authorizationId || !payload) {
          throw new Error("TRQP authorization context incomplete; cannot restore authorization");
        }

        const initialIds = this.context.initialAuthorizationIds || [];
        if (!initialIds.includes(authorizationId)) {
          this.addMessage("TRQP admin: no authorization restore required (was not present initially)");
        } else {
          const currentIds = await this.getEntityAuthorizationIds(entityId);
          if (currentIds.includes(authorizationId)) {
            this.addMessage(`TRQP admin: authorization ${authorizationId} already present`);
          } else {
            await this.fetchAdminJson(`/entities/${entityId}/authorizations/${authorizationId}`, {
              method: "POST",
            });
            this.addMessage(`TRQP admin: restored authorization ${authorizationId} for entity ${entityId}`);
          }
        }

        const authResp = await fetch(`${trqpBaseUrl}/authorization`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const authBody = await readJsonSafe(authResp);
        if (!authResp.ok) {
          throw new Error(
            `TRQP authorization failed after restore: ${authResp.status} ${authResp.statusText} ${authBody.raw}`
          );
        }
        const authorized = extractAuthorizationResult(authBody.json);
        this.addMessage(`TRQP authorization restored (authorized=${authorized})`);
      }

      if (runRecognition) {
        const entityId = this.context.recognitionEntityId;
        const recognitionId = this.context.recognitionId;
        const payload = this.context.recognitionPayload;
        if (!entityId || !recognitionId || !payload) {
          throw new Error("TRQP recognition context incomplete; cannot restore recognition");
        }
        const recognizedRegistryDid = payload.entity_id;
        if (!recognizedRegistryDid) {
          throw new Error("TRQP recognition payload missing entity_id; cannot restore recognition");
        }

        const initialIds = this.context.initialRecognitionIds || [];
        if (!initialIds.includes(recognitionId)) {
          this.addMessage("TRQP admin: no recognition restore required (was not present initially)");
        } else {
          const currentIds = await this.getEntityRecognitionIds(entityId);
          if (currentIds.includes(recognitionId)) {
            this.addMessage(`TRQP admin: recognition ${recognitionId} already present`);
          } else {
            await this.addRecognitionBinding(entityId, recognitionId, recognizedRegistryDid);
            this.addMessage(`TRQP admin: restored recognition ${recognitionId} for entity ${entityId}`);
          }
        }

        const recResp = await fetch(`${trqpBaseUrl}/recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const recBody = await readJsonSafe(recResp);
        if (!recResp.ok) {
          throw new Error(
            `TRQP recognition failed after restore: ${recResp.status} ${recResp.statusText} ${recBody.raw}`
          );
        }
        const recognized = extractRecognitionResult(recBody.json);
        this.addMessage(`TRQP recognition restored (recognized=${recognized})`);
      }

      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addError(error);
      this.setFailed();
      this.setCompleted();
      throw error;
    }
  }

  private buildAdminHeaders(): Record<string, string> {
    if (!this.context.adminAuthToken) return {};
    const header = this.context.adminAuthHeader || "Authorization";
    return { [header]: this.context.adminAuthToken };
  }

  private async fetchAdminJson(path: string, init?: RequestInit): Promise<any> {
    if (!this.context.adminBaseUrl) {
      throw new Error("TRQP admin base URL missing");
    }
    const method = (init?.method || "GET").toUpperCase();
    const url = `${this.context.adminBaseUrl}${path}`;
    const bodySize = typeof init?.body === "string" ? init.body.length : 0;
    this.addMessage(`TRQP admin request: ${method} ${url}${bodySize ? ` body_len=${bodySize}` : ""}`);
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.buildAdminHeaders(),
        ...(init?.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text().catch(() => "");
    const summary = summarizeAdminBody(contentType, rawBody);
    this.addMessage(
      `TRQP admin response: ${response.status} ${response.statusText}${summary ? ` ${summary}` : ""}`
    );
    if (!response.ok) {
      throw new Error(`TRQP admin request failed (${response.status} ${response.statusText}): ${rawBody}`);
    }
    if (contentType.includes("application/json")) {
      return rawBody ? JSON.parse(rawBody) : undefined;
    }
    return undefined;
  }

  private async addRecognitionBinding(
    entityId: number,
    recognitionId: number,
    recognizedRegistryDid: string
  ): Promise<void> {
    const payload = {
      recognition_id: recognitionId,
      recognized_registry_did: recognizedRegistryDid,
      recognized: true,
    };
    try {
      await this.fetchAdminJson(`/entities/${entityId}/recognitions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (!routeMissing) {
        throw err;
      }
      await this.fetchAdminJson(`/entities/${entityId}/recognitions/${recognitionId}`, {
        method: "POST",
      });
    }
  }

  private collectRelationIds(
    payload: any,
    embeddedKey: "authorizations" | "recognitions",
    linkKey: "authorization_id" | "recognition_id"
  ): number[] {
    if (!payload) return [];
    const toId = (value: any): number | null => {
      if (Number.isFinite(value)) return value;
      const nestedId = value?.id;
      if (Number.isFinite(nestedId)) return nestedId;
      const linkId = value?.[linkKey];
      if (Number.isFinite(linkId)) return linkId;
      return null;
    };

    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.[embeddedKey])
        ? payload[embeddedKey]
        : Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload?.records)
            ? payload.records
            : [];

    return list
      .map((item: any) => toId(item))
      .filter((id: number | null): id is number => Number.isFinite(id));
  }

  private async getEntityAuthorizationIds(entityId: number): Promise<number[]> {
    const entityDetails = await this.fetchAdminJson(`/entities/${entityId}`);
    const embeddedIds = this.collectRelationIds(entityDetails, "authorizations", "authorization_id");
    const hasEmbeddedAuthorizations =
      !!entityDetails &&
      typeof entityDetails === "object" &&
      Object.prototype.hasOwnProperty.call(entityDetails, "authorizations");
    if (hasEmbeddedAuthorizations) {
      return embeddedIds;
    }
    try {
      const relationRows = await this.fetchAdminJson(`/entities/${entityId}/authorizations`);
      return this.collectRelationIds(relationRows, "authorizations", "authorization_id");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (routeMissing) {
        return embeddedIds;
      }
      throw err;
    }
  }

  private async getEntityRecognitionIds(entityId: number): Promise<number[]> {
    const entityDetails = await this.fetchAdminJson(`/entities/${entityId}`);
    const embeddedIds = this.collectRelationIds(entityDetails, "recognitions", "recognition_id");
    const hasEmbeddedRecognitions =
      !!entityDetails &&
      typeof entityDetails === "object" &&
      Object.prototype.hasOwnProperty.call(entityDetails, "recognitions");
    if (hasEmbeddedRecognitions) {
      return embeddedIds;
    }
    try {
      const relationRows = await this.fetchAdminJson(`/entities/${entityId}/recognitions`);
      return this.collectRelationIds(relationRows, "recognitions", "recognition_id");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const routeMissing = message.includes("(404") || message.includes("Not Found");
      if (routeMissing) {
        return embeddedIds;
      }
      throw err;
    }
  }
}

class TrqpEnforcementEvaluationTask extends BaseRunnableTask {
  private context: TrqpEnforcementContext;

  constructor(context: TrqpEnforcementContext, name: string, description?: string) {
    super(name, description);
    this.context = context;
  }

  async run(): Promise<void> {
    super.run();
    const errors: string[] = [];
    const run1 = this.context.run1Result;
    const run2 = this.context.run2Result;
    const mode: TrqpMode = this.context.trqpMode || "both";
    const runAuthorization = mode === "authorization" || mode === "both";
    const runRecognition = mode === "recognition" || mode === "both";

    this.addMessage(
      `TRQP enforcement summary: run1 verified=${String(run1?.verified)} state=${run1?.state ?? "unknown"}; ` +
        `run2 verified=${String(run2?.verified)} state=${run2?.state ?? "unknown"}`
    );
    this.addMessage(`TRQP mode selected: ${mode}`);
    if (runAuthorization) {
      this.addMessage(
        `TRQP authorization: before=${String(this.context.authorizedBefore)} afterRemoval=${String(
          this.context.authorizedAfterRemoval
        )}`
      );
      if (this.context.authorizedBefore !== true) {
        errors.push("TRQP authorization was not true before run 1");
      }
      if (this.context.authorizedAfterRemoval !== false) {
        errors.push("TRQP authorization did not flip to false after removal");
      }
    }
    if (runRecognition) {
      this.addMessage(
        `TRQP recognition: before=${String(this.context.recognizedBefore)} afterRemoval=${String(
          this.context.recognizedAfterRemoval
        )}`
      );
      if (this.context.recognizedBefore !== true) {
        errors.push("TRQP recognition was not true before run 1");
      }
      if (this.context.recognizedAfterRemoval !== false) {
        errors.push("TRQP recognition did not flip to false after removal");
      }
    }

    if (!run1) {
      errors.push("Run 1 result missing; verifier flow did not complete");
    } else if (run1.verified !== true) {
      errors.push(`Run 1 did not verify (verified=${String(run1.verified)}, state=${run1.state ?? "unknown"})`);
      if (run1.error) {
        errors.push(`Run 1 error: ${run1.error}`);
      }
    }

    if (!run2) {
      errors.push("Run 2 result missing; verifier flow did not complete after TRQP change");
    } else if (run2.verified === true) {
      errors.push("Run 2 still verified=true after TRQP policy binding removal");
    } else if (run2.error) {
      errors.push(`Run 2 error: ${run2.error}`);
    }

    if (errors.length > 0) {
      errors.forEach((msg) => this.addError(msg));
      this.setFailed();
      this.setCompleted();
      return;
    }

    this.addMessage("TRQP enforcement verified: run outcomes differ as expected");
    this.setAccepted();
    this.setCompleted();
  }
}

class VerifierAcaPyEvaluationTask extends BaseRunnableTask {
  private _pipelineResults: any;

  constructor(name: string, description?: string) {
    super(name, description);
    this._pipelineResults = {};
  }

  async run(input?: any): Promise<void> {
    super.run();
    this._pipelineResults = input || {};
    this.addMessage("Verifier conformance flow (ACA-Py holder) completed");
    if (this._pipelineResults?.verified === true) {
      this.setAccepted();
    } else {
      const state = this._pipelineResults?.state ? `state=${this._pipelineResults.state}` : "state=unknown";
      this.addError(`Verifier did not verify presentation (${state})`);
      this.setFailed();
    }
    this.setCompleted();
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "VerifierAcaPyEvaluationTask",
      value: {
        message: "Verifier conformance (PE v2, DIDComm v2) executed",
        report: {
          protocol: "didcomm/v2",
          proofFormat: "PE v2 (DIF, Ed25519Signature2020)",
          verified: this._pipelineResults?.verified ?? false,
          state: this._pipelineResults?.state,
        },
      },
    };
  }
}

export default class VerifierAcaPyPipeline {
  private _dag: DAG;
  private controller: AgentController;
  private oobUrl: string | null;
  private oobUrlSecondary: string | null;
  private verifyTrqp: boolean;
  private trqpMode: TrqpMode;
  private trqpPolicyProfile?: TrqpPolicyProfile;
  private verifierController?: AgentController;

  constructor(
    controller: AgentController,
    oobUrl?: string,
    verifierController?: AgentController,
    options?: {
      verifyTrqp?: boolean;
      trqpMode?: TrqpMode;
      trqpPolicyProfile?: TrqpPolicyProfile;
      oobUrlSecondary?: string | null;
    }
  ) {
    this.controller = controller;
    this.oobUrl = oobUrl || null;
    this.oobUrlSecondary = options?.oobUrlSecondary ?? null;
    this.verifyTrqp = options?.verifyTrqp ?? false;
    this.trqpMode = options?.trqpMode ?? "both";
    this.trqpPolicyProfile = options?.trqpPolicyProfile;
    this.verifierController = verifierController;
    this._dag = this._make(controller);
  }

  setOobUrl(url: string) {
    this.oobUrl = url;
    this._dag = this._make(this.controller);
  }

  setOobUrls(primary: string, secondary?: string) {
    this.oobUrl = primary;
    this.oobUrlSecondary = secondary ?? null;
    this._dag = this._make(this.controller);
  }

  dag(): DAG {
    return this._dag;
  }

  async init() {
    this._dag = this._make(this.controller);
  }

  private getAdapter(): AcaPyAgentAdapter {
    const adapter = this.controller.getAdapter?.();
    if (!adapter) {
      throw new Error("Agent adapter is missing");
    }
    if (!(adapter instanceof AcaPyAgentAdapter)) {
      throw new Error("Verifier ACA-Py pipeline requires an ACA-Py adapter");
    }
    return adapter;
  }

  private _make(controller: AgentController): DAG {
    const dagName = this.verifyTrqp
      ? "Verifier Conformance Test (ACA-Py Holder + TRQP Enforcement)"
      : "Verifier Conformance Test (ACA-Py Holder)";
    const dag = new DAG(dagName);
    if (!this.oobUrl) {
      return dag;
    }

    const adapter = this.getAdapter();
    const demoVerifierAdapter = (() => {
      if (!this.verifierController) return undefined;
      const a = this.verifierController.getAdapter?.();
      return a instanceof AcaPyAgentAdapter ? a : undefined;
    })();

    if (!this.verifyTrqp) {
      const receiveTask = new ReceiveOobViaAcaPyTask(
        adapter,
        this.oobUrl,
        "Accept DIDComm v2 Invitation",
        "Consume verifier OOB v2 invitation using ACA-Py holder"
      );
      const awaitProofTask = new AwaitProofRequestTask(
        adapter,
        "Await Proof Request",
        "Wait for verifier to send PE v2 proof request",
        demoVerifierAdapter
      );
      const sendPresentationTask = new SendPresentationViaAcaPyTask(
        adapter,
        "Send Presentation",
        "Reply with Ayra Business Card presentation"
      );
      const waitVerificationTask = new WaitForVerificationViaAcaPyTask(
        adapter,
        "Wait for Verification",
        "Wait for verifier decision",
        demoVerifierAdapter,
        { enforceTrqp: false }
      );
      const evaluationTask = new VerifierAcaPyEvaluationTask(
        "Evaluate Verifier Test",
        "Summarize verifier conformance results"
      );

      const receiveNode = new TaskNode(receiveTask);
      dag.addNode(receiveNode);

      const requestNode = new TaskNode(awaitProofTask);
      requestNode.addDependency(receiveNode);
      dag.addNode(requestNode);

      const presentationNode = new TaskNode(sendPresentationTask);
      presentationNode.addDependency(requestNode);
      dag.addNode(presentationNode);

      const verificationNode = new TaskNode(waitVerificationTask);
      verificationNode.addDependency(presentationNode);
      dag.addNode(verificationNode);

      const evaluationNode = new TaskNode(evaluationTask);
      evaluationNode.addDependency(verificationNode);
      dag.addNode(evaluationNode);

      return dag;
    }

    const trqpContext: TrqpEnforcementContext = {
      trqpMode: this.trqpMode,
      trqpPolicyProfile: this.trqpPolicyProfile || serverState.trqpPolicyProfile,
    };
    const continueOnFailure = true;
    const run1ContinueOnFailure = false;
    const prepareContinueOnFailure = false;

    const prepareTrqpTask = new PrepareTrqpEnforcementTask(
      adapter,
      trqpContext,
      "Prepare TRQP Enforcement",
      "Resolve TRQP endpoint and verify selected policy binding(s)",
      { continueOnFailure: prepareContinueOnFailure }
    );

    const receiveRun1Task = new ReceiveOobViaAcaPyTask(
      adapter,
      this.oobUrl,
      "Accept Invitation (Run 1)",
      "Consume verifier OOB v2 invitation using ACA-Py holder",
      { continueOnFailure: run1ContinueOnFailure, context: trqpContext, contextKey: "run1Connection" }
    );
    const awaitRun1Task = new AwaitProofRequestTask(
      adapter,
      "Await Proof Request (Run 1)",
      "Wait for verifier to send PE v2 proof request",
      demoVerifierAdapter,
      { continueOnFailure: run1ContinueOnFailure, context: trqpContext, contextKey: "run1ProofExchangeId" }
    );
    const sendRun1Task = new SendPresentationViaAcaPyTask(
      adapter,
      "Send Presentation (Run 1)",
      "Reply with Ayra Business Card presentation",
      { continueOnFailure: run1ContinueOnFailure }
    );
    const waitRun1Task = new WaitForVerificationViaAcaPyTask(
      adapter,
      "Wait for Verification (Run 1)",
      "Wait for verifier decision",
      demoVerifierAdapter,
      {
        continueOnFailure: run1ContinueOnFailure,
        expectVerified: true,
        enforceTrqp: true,
        context: trqpContext,
        contextKey: "run1Result",
      }
    );

    const disableTrqpTask = new DisableTrqpAuthorizationTask(
      trqpContext,
      "Disable TRQP Policy Binding",
      "Remove selected TRQP policy binding(s) before run 2",
      { continueOnFailure }
    );

    const reuseConnectionTask = new ReuseConnectionTask(
      trqpContext,
      "Reuse Connection (Run 2)",
      "Re-use the run 1 connection for the second verification pass",
      { continueOnFailure }
    );
    const awaitRun2Task = new AwaitProofRequestTask(
      adapter,
      "Await Proof Request (Run 2)",
      "Wait for verifier to send PE v2 proof request on the existing connection",
      demoVerifierAdapter,
      { continueOnFailure, context: trqpContext, contextKey: "run2ProofExchangeId" }
    );
    const sendRun2Task = new SendPresentationViaAcaPyTask(
      adapter,
      "Send Presentation (Run 2)",
      "Reply with Ayra Business Card presentation",
      { continueOnFailure }
    );
    const waitRun2Task = new WaitForVerificationViaAcaPyTask(
      adapter,
      "Wait for Verification (Run 2)",
      "Wait for verifier decision after TRQP change",
      demoVerifierAdapter,
      {
        continueOnFailure,
        expectVerified: false,
        enforceTrqp: true,
        context: trqpContext,
        contextKey: "run2Result",
      }
    );

    const restoreTrqpTask = new RestoreTrqpAuthorizationTask(
      trqpContext,
      "Restore TRQP Policy Binding",
      "Restore selected TRQP policy binding(s) after run 2"
    );

    const enforcementEvalTask = new TrqpEnforcementEvaluationTask(
      trqpContext,
      "Evaluate TRQP Enforcement",
      "Validate verifier behavior across TRQP state changes"
    );

    const prepareNode = new TaskNode(prepareTrqpTask);
    dag.addNode(prepareNode);

    const receiveRun1Node = new TaskNode(receiveRun1Task);
    receiveRun1Node.addDependency(prepareNode);
    dag.addNode(receiveRun1Node);

    const awaitRun1Node = new TaskNode(awaitRun1Task);
    awaitRun1Node.addDependency(receiveRun1Node);
    dag.addNode(awaitRun1Node);

    const sendRun1Node = new TaskNode(sendRun1Task);
    sendRun1Node.addDependency(awaitRun1Node);
    dag.addNode(sendRun1Node);

    const waitRun1Node = new TaskNode(waitRun1Task);
    waitRun1Node.addDependency(sendRun1Node);
    dag.addNode(waitRun1Node);

    const disableNode = new TaskNode(disableTrqpTask);
    disableNode.addDependency(waitRun1Node);
    dag.addNode(disableNode);

    const reuseRun2Node = new TaskNode(reuseConnectionTask);
    reuseRun2Node.addDependency(disableNode);
    dag.addNode(reuseRun2Node);

    const awaitRun2Node = new TaskNode(awaitRun2Task);
    awaitRun2Node.addDependency(reuseRun2Node);
    dag.addNode(awaitRun2Node);

    const sendRun2Node = new TaskNode(sendRun2Task);
    sendRun2Node.addDependency(awaitRun2Node);
    dag.addNode(sendRun2Node);

    const waitRun2Node = new TaskNode(waitRun2Task);
    waitRun2Node.addDependency(sendRun2Node);
    dag.addNode(waitRun2Node);

    const restoreNode = new TaskNode(restoreTrqpTask);
    restoreNode.addDependency(waitRun2Node);
    dag.addNode(restoreNode);

    const evalNode = new TaskNode(enforcementEvalTask);
    evalNode.addDependency(restoreNode);
    dag.addNode(evalNode);

    return dag;
  }

}
