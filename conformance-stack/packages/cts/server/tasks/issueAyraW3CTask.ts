import BaseRunnableTask from "@demo/core/pipeline/src/tasks/baseRunnableTask";
import { Results, RunnableState } from "@demo/core/pipeline/src/types";
import { AgentController } from "@demo/core";
import { AcaPyAgentAdapter } from "@demo/core";
import fs from "fs";
import path from "path";
import { setLastIssuedCredentialId, setLastIssuedWalletRecordId, state as serverState } from "../state";

type ConnectionRecord = {
  id?: string;
};

export class IssueAyraW3CTask extends BaseRunnableTask {
  private controller: AgentController;
  private credential?: unknown;
  private verified = false;
  private credExId?: string;

  constructor(controller: AgentController, name: string, description?: string) {
    super(name, description);
    this.controller = controller;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (!this.controller) {
      this.addError("controller wasn't defined");
      throw new Error("Agent controller is not defined");
    }
    if (!this.controller.isReady()) {
      this.addMessage("Controller not ready yet");
    }
  }

  private loadContext(): any {
    const defaultPath = path.resolve(__dirname, "..", "..", "schema", "AyraBusinessCardV1R0.jsonld");
    const envPath =
      process.env.AYRA_CONTEXT_PATH || process.env.NEXT_PUBLIC_AYRA_CONTEXT_PATH;
    const candidates: string[] = [];
    if (envPath) {
      candidates.push(envPath);
      candidates.push(path.resolve(envPath));
      candidates.push(path.resolve(process.cwd(), envPath));
      candidates.push(path.resolve(__dirname, "..", "..", envPath));
      candidates.push(path.resolve(__dirname, "..", "..", "..", "..", envPath));
    }
    candidates.push(defaultPath);

    const contextPath = candidates.find((p) => fs.existsSync(p));
    if (!contextPath) {
      throw new Error(`Ayra context not found. Tried: ${candidates.join(", ")}`);
    }

    const raw = fs.readFileSync(contextPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed["@context"] ?? parsed;
  }

  private getContextVersion(): "v1" | "v2" {
    const raw =
      (process.env.AYRA_VC_CONTEXT_VERSION || process.env.NEXT_PUBLIC_AYRA_VC_CONTEXT_VERSION || "")
        .toLowerCase()
        .trim();
    if (raw === "v1" || raw === "1") return "v1";
    if (raw === "v2" || raw === "2") return "v2";
    return "v2";
  }

  private buildCredential(
    issuerDid: string,
    subjectDid: string,
    inlineContext: any,
    contextVersion: "v1" | "v2"
  ) {
    const normalizeEnvValue = (value?: string): string =>
      (value ?? "").split("#")[0].trim();
    const trustNetworkDid =
      normalizeEnvValue(process.env.AYRA_TRUST_NETWORK_DID) || "did:web:ayra.forum";
    const ecosystemId =
      normalizeEnvValue(process.env.AYRA_ECOSYSTEM_DID) || "did:web:ecosystem.example";
    const ayraSchemaId = "https://schema.affinidi.io/AyraBusinessCardV1R0.json";
    const w3cContext =
      contextVersion === "v1"
        ? "https://www.w3.org/2018/credentials/v1"
        : "https://www.w3.org/ns/credentials/v2";
    return {
      "@context": [
        w3cContext,
        inlineContext,
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      type: ["VerifiableCredential", "AyraBusinessCard"],
      // Include credentialSchema so ACA-Py DIF matching succeeds (ACA-Py #4006 workaround).
      credentialSchema: { id: ayraSchemaId, type: "JsonSchemaValidator2018" },
      issuer: { id: issuerDid },
      ...(contextVersion === "v1"
        ? {
            issuanceDate: "2025-01-01T00:00:00Z",
            expirationDate: "2026-01-01T00:00:00Z",
          }
        : {
            validFrom: "2025-01-01T00:00:00Z",
            validUntil: "2026-01-01T00:00:00Z",
          }),
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

  private extractCredExId(issued: any): string | undefined {
    const id =
      issued?.cred_ex_id ||
      issued?.cred_ex_record?.cred_ex_id ||
      issued?.credential_exchange_id ||
      issued?.credential_exchange?.credential_exchange_id ||
      issued?.result?.cred_ex_id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }

  private async fetchJson(url: string, opts: RequestInit): Promise<any> {
    const resp = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`ACA-Py admin request failed (${resp.status} ${resp.statusText}): ${text}`);
    }
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return resp.json();
    return undefined;
  }

  private async waitForCredentialExchangeDone(adminUrl: string, credExId: string): Promise<any> {
    const base = adminUrl.replace(/\/$/, "");
    const deadline = Date.now() + 300_000;
    let last: any;

    while (Date.now() < deadline) {
      last = await this.fetchJson(`${base}/issue-credential-2.0/records/${credExId}`, {
        method: "GET",
      }).catch(() => null);

      const record =
        last?.result ||
        last?.record ||
        last?.results ||
        last?.cred_ex_record ||
        last;
      const state = (record?.state || "").toLowerCase();
      if (state) {
        if (
          [
            "done",
            "credential-issued",
            "credential_issued",
            "credential-received",
            "credential_received",
            "issued",
          ].includes(state)
        ) {
          return record;
        }
        if (["abandoned", "declined"].includes(state) || state.includes("problem")) {
          throw new Error(`Credential exchange failed in state '${record?.state}'`);
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    const record = last?.result || last?.record || last?.results || last?.cred_ex_record || last;
    const state = record?.state || "unknown";
    throw new Error(
      `Timed out waiting for credential exchange ${credExId} to complete (last state: ${state})`
    );
  }

  private findValueByKey(record: unknown, keys: string[]): string | undefined {
    if (!record) return undefined;
    if (typeof record === "string") {
      return undefined;
    }
    if (Array.isArray(record)) {
      for (const item of record) {
        const found = this.findValueByKey(item, keys);
        if (found) return found;
      }
      return undefined;
    }
    if (typeof record === "object") {
      const obj = record as Record<string, unknown>;
      for (const key of keys) {
        const value = obj[key];
        if (typeof value === "string" && value.length > 0) return value;
      }
      for (const value of Object.values(obj)) {
        const found = this.findValueByKey(value, keys);
        if (found) return found;
      }
    }
    return undefined;
  }

  private extractCredentialId(record: any): string | undefined {
    return this.findValueByKey(record, ["credential_id", "credentialId", "cred_id", "credId"]);
  }

  private extractThreadId(record: any): string | undefined {
    return this.findValueByKey(record, ["thread_id", "threadId"]);
  }

  private extractConnectionId(record: any): string | undefined {
    return this.findValueByKey(record, ["connection_id", "connectionId"]);
  }

  private normalizeSubjectDid(did?: string): string | undefined {
    if (!did) return undefined;
    if (did.startsWith("did:")) return did;
    return `did:sov:${did}`;
  }

  private async fetchConnectionRecord(adminUrl: string, connectionId: string): Promise<any | null> {
    const base = adminUrl.replace(/\/$/, "");
    return this.fetchJson(`${base}/connections/${connectionId}`, { method: "GET" }).catch(() => null);
  }

  private async findIssuedWalletRecordId(
    adminUrl: string,
    issuerDid: string,
    subjectDid: string
  ): Promise<string | undefined> {
    const base = adminUrl.replace(/\/$/, "");
    const list = await this.fetchJson(`${base}/credentials/w3c`, {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => null);

    const records = (list?.results || list?.records || []) as any[];
    const matches = records.filter((record) => {
      if (record?.issuer_id === issuerDid) return true;
      const cred = record?.cred_value || record?.credential || record?.w3c_credential;
      const issuer = cred?.issuer?.id || cred?.issuer;
      if (issuer && issuer === issuerDid) return true;
      const subject = cred?.credentialSubject?.id;
      if (subject && subject === subjectDid) return true;
      const types = cred?.type;
      if (Array.isArray(types) && types.includes("AyraBusinessCard")) return true;
      return false;
    });

    const candidate = matches.length > 0 ? matches[matches.length - 1] : undefined;
    const id =
      candidate?.record_id ||
      candidate?.recordId ||
      candidate?.credential_id ||
      candidate?.credentialId;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }

  private async findIssueRecordCredentialId(
    adminUrl: string,
    connectionId?: string,
    threadId?: string
  ): Promise<string | undefined> {
    const base = adminUrl.replace(/\/$/, "");
    const params = new URLSearchParams();
    if (connectionId) params.set("connection_id", connectionId);
    const url = `${base}/issue-credential-2.0/records${params.toString() ? `?${params}` : ""}`;
    const list = await this.fetchJson(url, { method: "GET" }).catch(() => null);
    const records = (list?.results || list?.records || []) as any[];
    if (!records.length) return undefined;

    const matches = threadId
      ? records.filter((r) => r?.thread_id === threadId || r?.threadId === threadId)
      : records;

    const doneStates = new Set([
      "done",
      "credential-issued",
      "credential_issued",
      "credential-received",
      "credential_received",
      "issued",
    ]);

    const pick = (items: any[]) => {
      const sorted = [...items].sort((a, b) => {
        const aTime = Date.parse(a?.updated_at || a?.created_at || "");
        const bTime = Date.parse(b?.updated_at || b?.created_at || "");
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      });
      return sorted[0];
    };

    const done = matches.filter((r) => doneStates.has(String(r?.state || "").toLowerCase()));
    const candidate = pick(done.length > 0 ? done : matches);
    return this.extractCredentialId(candidate);
  }

  private getHolderAdminUrl(): string | null {
    const holderController = serverState.controller;
    if (!holderController) return null;
    const adapter = holderController.getAdapter?.();
    if (!adapter) return null;
    const adapterType = (adapter as any).constructor ? (adapter as any).constructor.name : typeof adapter;
    if (!(adapter instanceof AcaPyAgentAdapter) && adapterType !== "AcaPyAgentAdapter") return null;
    return (adapter as AcaPyAgentAdapter).getAdminUrl?.() ?? null;
  }

  private async ensureHolderSubjectDid(): Promise<string> {
    if (serverState.holderPresentationDid) {
      return serverState.holderPresentationDid;
    }
    const holderController = serverState.controller;
    if (!holderController) {
      throw new Error("Holder controller not available to create did:key");
    }
    const adapter = holderController.getAdapter?.();
    if (!adapter) {
      throw new Error("Holder adapter not available to create did:key");
    }
    const adapterType = (adapter as any).constructor ? (adapter as any).constructor.name : typeof adapter;
    if (!(adapter instanceof AcaPyAgentAdapter) && adapterType !== "AcaPyAgentAdapter") {
      throw new Error("Holder adapter is not ACA-Py; cannot create did:key");
    }
    const did = await (adapter as AcaPyAgentAdapter).createDidKey("ed25519");
    if (!did || !did.startsWith("did:key:")) {
      throw new Error(`Holder did:key creation failed (got: ${did || "empty"})`);
    }
    serverState.holderPresentationDid = did;
    console.info(`[IssueAyraW3CTask] Using holder did:key for credentialSubject.id: ${did}`);
    this.addMessage(`Using holder did:key for credentialSubject.id: ${did}`);
    return did;
  }

  async run(connectionRecord?: ConnectionRecord): Promise<void> {
    super.run();
    try {
      const adapter = this.controller.getAdapter() as any;
      const adapterType = adapter && adapter.constructor ? adapter.constructor.name : typeof adapter;
      const isAcaPy = adapter && (adapter instanceof AcaPyAgentAdapter || adapterType === "AcaPyAgentAdapter");
      if (!isAcaPy) {
        throw new Error("W3C issuance requires ACA-Py adapter");
      }
      if (!connectionRecord?.id) {
        throw new Error("Connection id is required to issue credential");
      }

      const adminUrl = (adapter as AcaPyAgentAdapter).getAdminUrl?.();
      if (!adminUrl) {
        throw new Error("ACA-Py admin URL missing; cannot resolve holder DID for subject");
      }

      const inlineContext = this.loadContext();
      const issuerDidMethod = (process.env.CTS_ISSUER_DID_METHOD || "key").trim();
      const issuerDidOptionsRaw = (process.env.CTS_ISSUER_DID_OPTIONS || "").trim();
      let issuerDidOptions: Record<string, unknown> = {};
      if (issuerDidOptionsRaw) {
        try {
          issuerDidOptions = JSON.parse(issuerDidOptionsRaw);
        } catch (error) {
          throw new Error(
            `CTS_ISSUER_DID_OPTIONS must be valid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      if (issuerDidMethod !== "key") {
        this.addMessage(`Using issuer DID method: ${issuerDidMethod}`);
        console.info(`[IssueAyraW3CTask] Using issuer DID method: ${issuerDidMethod}`);
      }
      const issuerDid = await adapter.createDid(issuerDidMethod, "ed25519", issuerDidOptions);
      const fragment = issuerDid.split(":").pop();
      if (!fragment) {
        throw new Error(`Could not derive verification method fragment for ${issuerDid}`);
      }

      const subjectDid = await this.ensureHolderSubjectDid();

      const contextVersion = this.getContextVersion();
      const credential = this.buildCredential(
        issuerDid,
        subjectDid,
        inlineContext,
        contextVersion
      );

      if (process.env.DEBUG_AYRA_CREDENTIAL === "true") {
        this.addMessage(
          `Issuing credential (DEBUG_AYRA_CREDENTIAL=true): ${JSON.stringify(
            credential,
            null,
            2
          )}`
        );
      }

      this.addMessage(
        `Issuing Ayra Business Card (LDP VC, context=${contextVersion}) via Issue Credential v2 (ld-proof)`
      );
      const issued: any = await adapter.issueLdProofCredential({
        connection_id: connectionRecord.id,
        comment: "Ayra Business Card (LDP)",
        auto_issue: true,
        auto_remove: false,
        credential_preview: {
          "@type": "issue-credential/2.0/credential-preview",
          attributes: [],
        },
        filter: {
          ld_proof: {
            credential,
            options: {
              proofType: "Ed25519Signature2020",
              verificationMethod: `${issuerDid}#${fragment}`,
              proofPurpose: "assertionMethod",
            },
          },
        },
      });

      this.credExId = this.extractCredExId(issued);
      if (!this.credExId) {
        throw new Error("ACA-Py did not return a credential exchange id (cred_ex_id)");
      }

      this.addMessage(`Waiting for issuance to complete (cred_ex_id=${this.credExId})`);
      const finalRecord = await this.waitForCredentialExchangeDone(adminUrl, this.credExId);

      this.credential = finalRecord;
      this.verified = true;

      // Use resolved subject DID as fallback in case the credential payload omitted it.
      const issuedSubjectDid = credential?.credentialSubject?.id || subjectDid;
      const threadId = this.extractThreadId(finalRecord);
      const connectionId = this.extractConnectionId(finalRecord);

      let issueCredentialId = this.extractCredentialId(finalRecord);
      if (!issueCredentialId) {
        const holderAdminUrl = this.getHolderAdminUrl();
        if (holderAdminUrl) {
          issueCredentialId = await this.findIssueRecordCredentialId(holderAdminUrl, connectionId, threadId);
        }
      }

      if (issueCredentialId) {
        setLastIssuedCredentialId(issueCredentialId, "issue-record");
        this.addMessage(`Stored issued credential_id for proof selection: ${issueCredentialId}`);
        console.info(`[IssueAyraW3CTask] Stored issued credential_id for proof selection: ${issueCredentialId}`);
      } else {
        this.addMessage("Issued credential_id not resolved from issue record");
        console.info("[IssueAyraW3CTask] Issued credential_id not resolved from issue record");
      }

      const holderAdminUrl = this.getHolderAdminUrl();
      const walletRecordId =
        holderAdminUrl
          ? await this.findIssuedWalletRecordId(holderAdminUrl, issuerDid, issuedSubjectDid)
          : undefined;
      if (walletRecordId) {
        setLastIssuedWalletRecordId(walletRecordId);
        this.addMessage(`Stored holder wallet record_id for fallback: ${walletRecordId}`);
        console.info(`[IssueAyraW3CTask] Stored holder wallet record_id for fallback: ${walletRecordId}`);
      } else {
        console.info("[IssueAyraW3CTask] Holder /credentials/w3c did not return a wallet record_id");
      }

      const issuedSummary = {
        credExId: this.credExId,
        issuer: issuerDid,
        subject: issuedSubjectDid || "unknown",
      };
      this.addMessage(
        `Issued Ayra Business Card (W3C): ${JSON.stringify(issuedSummary)}`
      );
      this.addMessage(`Issued credential payload:\n${JSON.stringify(credential, null, 2)}`);
      console.log("[IssueAyraW3CTask] Issued credential payload", credential);
      console.log(
        "[IssueAyraW3CTask] Issued credential payload (json)",
        JSON.stringify(credential, null, 2)
      );
      console.log("[IssueAyraW3CTask] Issued credential", issuedSummary);

      this.setCompleted();
      this.setAccepted();
    } catch (e) {
      console.error(e);
      this.addError(e);
      this.setCompleted();
      this.setFailed();
      throw e;
    }
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "IssueAyraW3CTask",
      value: {
        verified: this.verified,
        credExId: this.credExId,
        credential: this.credential,
      },
    };
  }
}
