import type {
  AgentAdapter,
  ConnectionInitResult,
  ControllerConnectionRecord,
  CredentialOfferPayload,
  CredentialOfferResult,
  ProofRequestPayload,
} from "./types";
import { fetch } from "undici";

const normalizeEnvValue = (value?: string): string =>
  (value ?? "").split("#")[0].trim();

const resolveInternalHolderDidcommEndpoint = (): string | null => {
  const explicit = normalizeEnvValue(process.env.INTERNAL_HOLDER_DIDCOMM_ENDPOINT);
  if (explicit) return explicit;
  // Heuristic default for docker-compose: internal ACA-Py holder runs in another container and
  // must reach the Credo agent inbound transport on the `app` service.
  const port = Number(normalizeEnvValue(process.env.AGENT_PORT || "")) || 5006;
  return `http://app:${port}`;
};

const rewriteOobInvitationForInternalHolder = (invitation: unknown): unknown => {
  if (!invitation || typeof invitation !== "object") return invitation;
  const endpoint = resolveInternalHolderDidcommEndpoint();
  if (!endpoint) return invitation;

  const isLoopback = (se: string): boolean =>
    se.startsWith("http://localhost") ||
    se.startsWith("https://localhost") ||
    se.startsWith("http://127.0.0.1") ||
    se.startsWith("https://127.0.0.1") ||
    se.startsWith("http://0.0.0.0") ||
    se.startsWith("https://0.0.0.0");

  // Clone to avoid mutating the original invitation used for UI/QR.
  const cloned = JSON.parse(JSON.stringify(invitation)) as any;

  const services = cloned?.services;
  if (Array.isArray(services)) {
    cloned.services = services.map((service: any) => {
      if (!service || typeof service !== "object") return service;
      const patched: any = { ...service };
      if (typeof patched.serviceEndpoint === "string") {
        // Only rewrite loopback endpoints which are unreachable from the holder container.
        // Leave non-loopback endpoints (e.g., ACA-Py issuer `http://acapy-control:8041`) untouched.
        const se = patched.serviceEndpoint;
        if (isLoopback(se)) {
          patched.serviceEndpoint = endpoint;
        }
      }
      return patched;
    });
  }

  return cloned;
};

export class AgentController {
  constructor(private readonly adapter: AgentAdapter) {}

  getAdapter(): AgentAdapter {
    return this.adapter;
  }

  isReady(): boolean {
    return this.adapter.isReady();
  }

  get label(): string {
    return this.adapter.getLabel();
  }

  async establishConnection(): Promise<ConnectionInitResult> {
    if (!this.isReady()) {
      throw new Error(
        "Agent adapter is not ready. Ensure the underlying agent is initialized."
      );
    }

    const invitation = await this.adapter.createOutOfBandInvitation();
    const invitationUrl = this.adapter.buildInvitationUrl(invitation);
    const connectionRecordPromise = (async (): Promise<ControllerConnectionRecord> => {
      // If an internal ACA-Py holder control URL is provided, auto-receive the invitation
      const holderControlUrl = process.env.ACAPY_HOLDER_CONTROL_URL;
      const autoSendToHolder =
        ((process.env.ACAPY_AUTO_SEND_INVITE_TO_INTERNAL_HOLDER ||
          process.env.ACAPY_HOLDER_AUTO_ACCEPT ||
          "").toLowerCase() === "true");
      if (autoSendToHolder && holderControlUrl && invitation.raw) {
        console.log("[Issuer] Auto-sending invitation to internal holder at", holderControlUrl);
        try {
          const internalInvitation = rewriteOobInvitationForInternalHolder(invitation.raw);
          const response = await fetch(
            `${holderControlUrl.replace(/\/$/, "")}/connections/receive-invitation`,
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invitation: internalInvitation,
                auto_accept: true,
                use_existing_connection: false,
              }),
            }
          );
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.warn(
              `[Issuer] Failed to auto-send invitation to holder control (${response.status} ${response.statusText}): ${text}`
            );
          } else {
            console.log("[Issuer] Invitation posted to internal holder");
          }
        } catch (err) {
          console.warn("[Issuer] Failed to auto-send invitation to holder control", err);
        }
      }

      const connectionRecord = await this.adapter.waitForConnection(invitation);
      if (connectionRecord.id) {
        await this.adapter.waitUntilConnected(connectionRecord.id);
      }
      if (this.adapter.getConnectionRecord) {
        return this.adapter.getConnectionRecord(connectionRecord.id);
      }
      return connectionRecord;
    })();

    return { invitation, invitationUrl, connectionRecordPromise };
  }

  async requestProof(
    connectionId: string,
    proof: ProofRequestPayload
  ): Promise<any> {
    if (!connectionId) {
      throw new Error("connectionId is required for requestProof");
    }
    if (!proof) {
      throw new Error("proof configuration is required for requestProof");
    }
    return this.adapter.requestProofAndAccept(connectionId, proof);
  }

  async issueCredential(
    payload: CredentialOfferPayload
  ): Promise<CredentialOfferResult> {
    if (!payload.connectionId) {
      throw new Error("connectionId is required to issue a credential");
    }
    if (!payload.issuerDid) {
      throw new Error("issuerDid is required to issue a credential");
    }
    if (!payload.attributes?.length) {
      throw new Error("At least one attribute is required to issue a credential");
    }
    return this.adapter.issueCredential(payload);
  }
}
