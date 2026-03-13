import { fetch } from "undici";

import type {
  AgentAdapter,
  ControllerConnectionRecord,
  ControllerInvitation,
  CredentialOfferPayload,
  CredentialOfferResult,
  ProofRequestPayload,
} from "../types";

const DEFAULT_PROFILE = "issuer" as const;

export type AcaPyAdapterOptions = {
  baseUrl: string;
  profile?: "issuer" | "verifier" | "holder";
  // Injected webhook event source for ACA-Py proof state updates.
  // TODO: Wire to ACA-Py webhook stream or acapy-control `/events/stream` and emit proof state events here.
  proofEvents?: AcaPyProofEventSource;
  // Explicitly opt-in to sending ACA-Py auto flags on /proofs/request.
  // These are omitted by default to avoid passing unknown fields.
  enableAutoVerifyFlag?: boolean;
  enableAutoRemoveFlag?: boolean;
  autoVerifyValue?: boolean;
  autoRemoveValue?: boolean;
};

export type AcaPyProofState = "request-sent" | "presentation-received" | "done" | "abandoned" | string;

export type AcaPyProofRecord = {
  proof_exchange_id?: string;
  pres_ex_id?: string;
  presentation_exchange_id?: string;
  thread_id?: string;
  connection_id?: string;
  state?: AcaPyProofState;
  presentation_state?: AcaPyProofState;
  verified?: boolean | string;
  problem_report?: unknown;
  error?: string;
  reason?: string;
  [key: string]: unknown;
};

export type AcaPyProofStateEvent = {
  record?: AcaPyProofRecord;
  payload?: AcaPyProofRecord;
  topic?: string;
};

export type AcaPyProofEventSource = {
  onProofStateChanged(handler: (event: AcaPyProofStateEvent) => void): () => void;
};

interface AgentStartResponse {
  status: string;
  profile: string;
  admin_url: string;
}

interface InvitationApiResponse {
  invitation_url: string;
  connection_id: string;
  out_of_band_id?: string;
  invitation: unknown;
}

interface ConnectionRecordApiResponse {
  connection_id: string;
  state: string;
  record: unknown;
}

interface ProofRequestResponse {
  proof_exchange_id: string;
  state?: string;
  record?: AcaPyProofRecord;
}

const PROOF_WAIT_TIMEOUT_MS = 180_000;
const TERMINAL_PROOF_STATES = new Set(["done", "abandoned"]);
const PRESENTATION_RECEIVED_STATES = new Set(["presentation-received", "presentation_received"]);

export class AcaPyAgentAdapter implements AgentAdapter {
  private ready = false;
  private adminUrl?: string;

  private constructor(private readonly options: AcaPyAdapterOptions) {}

  static async create(options: AcaPyAdapterOptions): Promise<AcaPyAgentAdapter> {
    const adapter = new AcaPyAgentAdapter(options);
    await adapter.start();
    return adapter;
  }

  private get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, "");
  }

  private ensureAdminUrl(): string {
    if (!this.adminUrl) {
      throw new Error("ACA-Py admin URL is not set");
    }
    return this.adminUrl.replace(/\/$/, "");
  }

  private async start(): Promise<void> {
    const response = await this.post<AgentStartResponse>("/agent/start", {
      profile: this.options.profile ?? DEFAULT_PROFILE,
    });
    this.adminUrl = response.admin_url;
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    if (!this.ready) return;
    await this.post("/agent/stop", {});
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  getLabel(): string {
    return `ACA-Py (${this.options.profile ?? DEFAULT_PROFILE})`;
  }

  getAdminUrl(): string | undefined {
    return this.adminUrl;
  }

  getControlUrl(): string {
    return this.baseUrl;
  }

  async createOutOfBandInvitation(): Promise<ControllerInvitation> {
    const payload = await this.post<InvitationApiResponse>(
      "/connections/create-invitation",
      {}
    );
    return {
      id: payload.connection_id,
      outOfBandId:
        payload.out_of_band_id ||
        (payload as any).oob_id ||
        (payload.invitation as any)?.["@id"] ||
        (payload.invitation as any)?.["id"],
      url: payload.invitation_url,
      raw: payload.invitation,
    };
  }

  async createDid(
    method: string,
    keyType: "ed25519" | "bls12381g2" = "ed25519",
    options: Record<string, unknown> = {}
  ): Promise<string> {
    const mergedOptions: Record<string, unknown> = { ...options };
    if (keyType && !Object.prototype.hasOwnProperty.call(mergedOptions, "key_type")) {
      mergedOptions.key_type = keyType;
    }
    const response = await this.post<{ did: string }>("/wallet/did/create", {
      method,
      options: mergedOptions,
    });
    return response.did;
  }

  async createDidKey(keyType: "ed25519" | "bls12381g2" = "ed25519"): Promise<string> {
    return this.createDid("key", keyType);
  }

  async issueLdpCredential(payload: unknown): Promise<unknown> {
    const admin = this.ensureAdminUrl();
    return this.rawPost(`${admin}/vc/credentials/issue`, payload);
  }

  async verifyLdpCredential(vc: unknown): Promise<unknown> {
    const admin = this.ensureAdminUrl();
    return this.rawPost(`${admin}/vc/credentials/verify`, { verifiableCredential: vc });
  }

  async issueLdProofCredential(payload: unknown): Promise<unknown> {
    const admin = this.ensureAdminUrl();
    return this.rawPost(`${admin}/issue-credential-2.0/send-offer`, payload);
  }

  private async rawPost(url: string, body: unknown): Promise<any> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ACA-Py control request failed: ${response.status} ${response.statusText} - ${text}`
      );
    }
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  buildInvitationUrl(invitation: ControllerInvitation): string {
    return invitation.url;
  }

  async waitForConnection(
    invitation: ControllerInvitation
  ): Promise<ControllerConnectionRecord> {
    const payload: Record<string, string> = {};
    if (invitation.id) payload.connection_id = invitation.id;
    if (invitation.outOfBandId) payload.oob_id = invitation.outOfBandId;

    if (!payload.connection_id && !payload.oob_id) {
      throw new Error("Invitation did not include a connection or out-of-band id");
    }

    const record = await this.post<ConnectionRecordApiResponse>("/connections/wait", payload);
    return { id: record.connection_id, raw: record.record ?? record };
  }

  async waitUntilConnected(connectionId: string): Promise<void> {
    if (!connectionId) return;
    await this.post("/connections/wait", { connection_id: connectionId });
  }

  async requestProofAndAccept(
    connectionId: string,
    proof: ProofRequestPayload
  ): Promise<any> {
    const protocolVersion = proof.protocolVersion ?? "v2";
    if (protocolVersion !== "v2") {
      throw new Error(
        `ACA-Py adapter currently supports only proof protocol version v2 (received ${protocolVersion})`
      );
    }

    const requestPayload: Record<string, unknown> = {
      connection_id: connectionId,
      protocol_version: protocolVersion,
      proof_formats: proof.proofFormats,
    };
    // Avoid sending optional auto flags unless explicitly enabled; unknown fields can break strict ACA-Py deployments.
    if (this.options.enableAutoVerifyFlag) {
      requestPayload.auto_verify = this.options.autoVerifyValue ?? false;
    }
    if (this.options.enableAutoRemoveFlag) {
      requestPayload.auto_remove = this.options.autoRemoveValue ?? false;
    }

    const response = await this.post<ProofRequestResponse>("/proofs/request", requestPayload);
    const proofExchangeId = response.proof_exchange_id;
    if (!proofExchangeId) {
      throw new Error("ACA-Py /proofs/request response missing proof_exchange_id");
    }

    const initialRecord = this.normalizeProofRecord(response);
    const initialState = this.normalizeProofState(initialRecord);
    if (initialState === "abandoned") {
      throw new Error(
        `ACA-Py proof exchange abandoned immediately (proof_exchange_id=${proofExchangeId}, state=${initialState})`
      );
    }
    if (initialState === "done") {
      return initialRecord;
    }

    // Prefer webhook-driven state changes over polling to avoid races and busy-wait loops.
    return this.waitForProofCompletion({
      proofExchangeId,
      connectionId,
      timeoutMs: PROOF_WAIT_TIMEOUT_MS,
    });
  }

  async issueCredential(payload: CredentialOfferPayload): Promise<CredentialOfferResult> {
    if (!payload.credentialDefinitionId) {
      throw new Error(
        "ACA-Py adapter requires credentialDefinitionId to issue a credential. " +
          "Provide one in CredentialIssuanceOptions when using ACA-Py."
      );
    }
    const attributeMap = payload.attributes.reduce<Record<string, string>>((acc, { name, value }) => {
      acc[name] = String(value);
      return acc;
    }, {});

    const response = await this.post<{
      credential_exchange_id: string;
      record?: unknown;
    }>("/credentials/offer", {
      connection_id: payload.connectionId,
      credential_definition_id: payload.credentialDefinitionId,
      attributes: attributeMap,
      protocol_version: "v2",
    });
    return {
      schemaId: payload.schemaId,
      legacySchemaId: payload.schemaId,
      credentialDefinitionId: payload.credentialDefinitionId,
      legacyCredentialDefinitionId: payload.credentialDefinitionId,
      record: response.record,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const targetPath = path.startsWith("/") ? path : `/${path}`;
    const response = await fetch(`${this.baseUrl}${targetPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ACA-Py control request failed: ${response.status} ${response.statusText} - ${text}`
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return {} as T;
  }

  private normalizeProofState(record?: AcaPyProofRecord): string | null {
    const raw = record?.state || record?.presentation_state;
    if (!raw || typeof raw !== "string") return null;
    return raw.replace(/_/g, "-").toLowerCase();
  }

  private resolveProofExchangeId(record?: AcaPyProofRecord): string | undefined {
    return (
      record?.proof_exchange_id ||
      record?.pres_ex_id ||
      record?.presentation_exchange_id
    );
  }

  private isAcaPyProofRecord(value: unknown): value is AcaPyProofRecord {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.proof_exchange_id === "string" ||
      typeof record.pres_ex_id === "string" ||
      typeof record.presentation_exchange_id === "string" ||
      typeof record.state === "string" ||
      typeof record.presentation_state === "string" ||
      typeof record.thread_id === "string"
    );
  }

  private normalizeProofRecord(value: unknown): AcaPyProofRecord | undefined {
    // Normalize null -> undefined and unwrap common response envelopes (record/result/payload).
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "object") return undefined;
    const wrapper = value as { record?: unknown; result?: unknown; payload?: unknown };
    const candidate = wrapper.record ?? wrapper.result ?? wrapper.payload ?? value;
    return this.isAcaPyProofRecord(candidate) ? candidate : undefined;
  }

  private extractProofRecord(event: AcaPyProofStateEvent | AcaPyProofRecord): AcaPyProofRecord | undefined {
    return this.normalizeProofRecord(event);
  }

  private extractProblemReport(record?: AcaPyProofRecord): string | null {
    const problem =
      record?.problem_report ||
      record?.error ||
      record?.reason;
    if (!problem) return null;
    if (typeof problem === "string") return problem;
    try {
      return JSON.stringify(problem);
    } catch {
      return String(problem);
    }
  }

  private async verifyProofExchange(proofExchangeId: string, connectionId: string): Promise<void> {
    await this.post("/proofs/verify", {
      proof_exchange_id: proofExchangeId,
      connection_id: connectionId,
    });
  }

  private waitForProofCompletion(options: {
    proofExchangeId: string;
    connectionId: string;
    timeoutMs: number;
  }): Promise<AcaPyProofRecord> {
    const eventSource = this.options.proofEvents;
    if (!eventSource) {
      throw new Error(
        "ACA-Py proof event source is not configured. Provide AcaPyAdapterOptions.proofEvents to enable webhook-driven state updates."
      );
    }

    return new Promise((resolve, reject) => {
      let lastRecord: AcaPyProofRecord | undefined;
      let verifyTriggered = false;
      let verifyError: string | null = null;
      let unsubscribe: (() => void) | null = null;

      const timeoutId = setTimeout(() => {
        cleanup();
        const state = this.normalizeProofState(lastRecord) ?? "unknown";
        const problem = this.extractProblemReport(lastRecord);
        const problemSuffix = problem ? `, problem=${problem}` : "";
        const verifySuffix = verifyError ? `, verifyError=${verifyError}` : "";
        reject(
          new Error(
            `Timed out waiting for ACA-Py proof exchange to complete (proof_exchange_id=${options.proofExchangeId}, state=${state}${problemSuffix}${verifySuffix})`
          )
        );
      }, options.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();
      };

      const handleEvent = (event: AcaPyProofStateEvent) => {
        const record = this.extractProofRecord(event);
        if (!record) return;
        const exchangeId = this.resolveProofExchangeId(record);
        if (!exchangeId || exchangeId !== options.proofExchangeId) {
          return;
        }

        lastRecord = record;
        const state = this.normalizeProofState(record);
        const verified = record.verified;

        if (
          state &&
          PRESENTATION_RECEIVED_STATES.has(state) &&
          !verifyTriggered &&
          !(verified === true || verified === "true")
        ) {
          verifyTriggered = true;
          // Trigger verification once the presentation is received; rely on webhooks for the final state.
          void this.verifyProofExchange(options.proofExchangeId, options.connectionId).catch((err) => {
            verifyError = err instanceof Error ? err.message : String(err);
          });
        }

        if (state && TERMINAL_PROOF_STATES.has(state)) {
          cleanup();
          if (state === "abandoned") {
            const problem = this.extractProblemReport(record);
            const problemSuffix = problem ? `, problem=${problem}` : "";
            const verifySuffix = verifyError ? `, verifyError=${verifyError}` : "";
            reject(
              new Error(
                `ACA-Py proof exchange abandoned (proof_exchange_id=${options.proofExchangeId}, state=${state}${problemSuffix}${verifySuffix})`
              )
            );
            return;
          }
          resolve(record);
        }
      };

      unsubscribe = eventSource.onProofStateChanged(handleEvent);
    });
  }
}
