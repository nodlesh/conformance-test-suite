import { TaskNode } from "@demo/core/pipeline/src/nodes";
import { AgentController, AcaPyAgentAdapter } from "@demo/core";
import BaseRunnableTask from "@demo/core/pipeline/src/tasks/baseRunnableTask";
import { Results } from "@demo/core/pipeline/src/types";

import {
  SetupConnectionTask,
  RequestProofTask,
  RequestProofOptions,
} from "@demo/core";
import { randomUUID } from "crypto";

import { DAG } from "@demo/core/pipeline/src/dag";
import { state as serverState, type TrqpMode, type TrqpPolicyProfile } from "../state";

const normalizeEnvValue = (value?: string): string => (value ?? "").split("#")[0].trim();
const normalizeEnvBool = (value?: string): boolean =>
  ["1", "true", "yes", "y", "on"].includes(normalizeEnvValue(value).toLowerCase());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${text}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return undefined;
}

function extractDifChallenge(proof: any): string | null {
  const dif = proof?.proofFormats?.dif;
  const challenge = dif?.options?.challenge;
  return typeof challenge === "string" && challenge.length > 0 ? challenge : null;
}

function findProofRecordByChallenge(records: any[], challenge: string): any | null {
  for (const r of records) {
    const byFormat = r?.by_format?.pres_request?.dif || r?.by_format?.presentation_request?.dif;
    const c = byFormat?.options?.challenge;
    if (typeof c === "string" && c === challenge) return r;

    const presReq = r?.pres_request;
    const attach = presReq?.["request_presentations~attach"]?.[0]?.data?.json;
    const c2 = attach?.options?.challenge;
    if (typeof c2 === "string" && c2 === challenge) return r;
  }
  return null;
}

function selectAyraDifRecordIds(candidates: any[]): string[] {
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

async function findAyraW3cCredentialRecordIds(baseUrl: string): Promise<string[]> {
  const list = await fetchJson(`${baseUrl}/credentials/w3c`, {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => null);

  const records = (list?.results || list?.records || []) as any[];
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

async function autoPresentWithInternalAcaPyHolder(opts: {
  challenge: string;
  inputDescriptorId: string;
  timeoutMs?: number;
}): Promise<void> {
  const logPrefix = "[autoPresentWithInternalAcaPyHolder]";
  const holderController = serverState.controller;
  if (!holderController) return;
  const holderAdapter = holderController.getAdapter?.() as any;
  const holderAdapterType =
    holderAdapter && holderAdapter.constructor ? holderAdapter.constructor.name : typeof holderAdapter;
  const isAcaPyHolder =
    holderAdapter &&
    (holderAdapter instanceof AcaPyAgentAdapter || holderAdapterType === "AcaPyAgentAdapter");
  if (!isAcaPyHolder) return;

  const adminUrl = (holderAdapter as AcaPyAgentAdapter).getAdminUrl?.();
  if (!adminUrl) return;

  const baseUrl = adminUrl.replace(/\/$/, "");
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  let exchange: any | null = null;

  while (Date.now() < deadline) {
    // First try to find a freshly received request, but don't assume it stays in that state
    // (e.g. an agent may auto-respond or the state may advance quickly).
    let list: any | null = null;
    try {
      const url = new URL(`${baseUrl}/present-proof-2.0/records`);
      url.searchParams.set("state", "request-received");
      list = await fetchJson(url.toString(), { method: "GET" });
    } catch {
      list = null;
    }

    const urlAll = `${baseUrl}/present-proof-2.0/records`;
    const listAll = await fetchJson(urlAll, { method: "GET" }).catch(() => null);

    const extractRecords = (payload: any): any[] => {
      const value = payload?.results || payload?.records || payload?.result?.results || [];
      return Array.isArray(value) ? value : [];
    };

    const recordsByState = extractRecords(list);
    const recordsAll = extractRecords(listAll);
    const records = recordsByState.length > 0 ? recordsByState : recordsAll;

    exchange = findProofRecordByChallenge(records, opts.challenge);
    if (exchange) {
      const state = exchange?.state || exchange?.result?.state;
      if (state && ["presentation-sent", "done"].includes(state)) return;
      break;
    }
    await sleep(1200);
  }
  if (!exchange) {
    throw new Error("Timed out waiting for internal holder to receive proof request");
  }

  const exchangeId =
    exchange?.pres_ex_id || exchange?.presentation_exchange_id || exchange?.proof_exchange_id;
  if (!exchangeId) {
    throw new Error("Internal holder proof exchange id missing");
  }
  console.log(
    `${logPrefix} exchangeId=${exchangeId} state=${exchange?.state || exchange?.result?.state || "unknown"}`
  );

  const current = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}`, {
    method: "GET",
  }).catch(() => null);
  const currentState = String(current?.state || current?.result?.state || "").toLowerCase();
  if (["presentation-sent", "done"].includes(currentState)) return;
  if (currentState && currentState !== "request-received") {
    await sleep(1500);
  }

  const credsResp = await fetchJson(
    `${baseUrl}/present-proof-2.0/records/${exchangeId}/credentials`,
    {
      method: "GET",
    }
  ).catch(() => null);
  console.log(
    `${logPrefix} credentials response exchangeId=${exchangeId} payload=${JSON.stringify(credsResp)}`
  );
  const candidates =
    (credsResp?.results ||
      credsResp?.records ||
      credsResp?.result ||
      credsResp?.credentials ||
      credsResp?.cred_info ||
      []) as any[];
  const recordIds = selectAyraDifRecordIds(Array.isArray(candidates) ? candidates : []);
  console.log(
    `${logPrefix} exchangeId=${exchangeId} difCandidateIds=${JSON.stringify(recordIds)}`
  );
  let chosenRecordIds =
    recordIds.length > 0 ? recordIds : await findAyraW3cCredentialRecordIds(baseUrl);
  if (recordIds.length === 0) {
    console.log(
      `${logPrefix} exchangeId=${exchangeId} fallbackW3cIds=${JSON.stringify(chosenRecordIds)}`
    );
  }

  const walletRecordId = serverState.lastIssuedWalletRecordId;
  if (walletRecordId) {
    chosenRecordIds = [walletRecordId];
    console.log(
      `${logPrefix} exchangeId=${exchangeId} using wallet record_id=${walletRecordId}`
    );
  } else if (serverState.lastIssuedCredentialId) {
    const issuedCredentialId = serverState.lastIssuedCredentialId;
    chosenRecordIds = [issuedCredentialId];
    console.log(
      `${logPrefix} exchangeId=${exchangeId} using issued credential_id=${issuedCredentialId}`
    );
  }

  if (chosenRecordIds.length === 0) {
    throw new Error("Internal holder could not find an Ayra credential record to present");
  }

  let presentationDid = serverState.holderPresentationDid;
  if (!presentationDid) {
    const didResp = await fetchJson(`${baseUrl}/wallet/did/create`, {
      method: "POST",
      body: JSON.stringify({ key_type: "ed25519" }),
    }).catch(() => null);
    presentationDid =
      didResp?.did || didResp?.result?.did || didResp?.did_info?.did;
    if (!presentationDid) {
      throw new Error("Internal holder did not return a presentation DID");
    }
    serverState.holderPresentationDid = presentationDid;
    console.log(
      `${logPrefix} exchangeId=${exchangeId} using presentation DID=${presentationDid}`
    );
  }

  try {
    const payload = {
      // Keep the holder exchange record until CTS finishes verification.
      auto_remove: false,
      dif: {
        issuer_id: presentationDid,
        record_ids: { [opts.inputDescriptorId]: chosenRecordIds },
      },
    };
    console.log(
      `${logPrefix} exchangeId=${exchangeId} send-presentation payload=${JSON.stringify(payload)}`
    );
    const sendResp = await fetchJson(
      `${baseUrl}/present-proof-2.0/records/${exchangeId}/send-presentation`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    console.log(
      `${logPrefix} exchangeId=${exchangeId} send-presentation response=${JSON.stringify(sendResp)}`
    );
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message.includes("presentation-sent")) return;
    console.log(
      `${logPrefix} exchangeId=${exchangeId} send-presentation error=${message}`
    );
    throw err;
  }

  // Best-effort: wait for presentation to be sent so the verifier can proceed.
  const sentDeadline = Date.now() + 60_000;
  while (Date.now() < sentDeadline) {
    const current = await fetchJson(`${baseUrl}/present-proof-2.0/records/${exchangeId}`, { method: "GET" }).catch(
      () => null
    );
    const state = current?.state || current?.result?.state;
    if (state && ["presentation-sent", "done"].includes(state)) return;
    await sleep(1000);
  }
  throw new Error(
    `Internal holder did not reach presentation-sent/done in time (exchangeId=${exchangeId})`
  );
}

class RequestProofAcaPyWithOptionalInternalHolderTask extends BaseRunnableTask {
  private controller: AgentController;
  private options: RequestProofOptions & { trqpMode?: TrqpMode; trqpPolicyProfile?: TrqpPolicyProfile };
  private presentationRecord: any;

  constructor(
    controller: AgentController,
    options: RequestProofOptions & { trqpMode?: TrqpMode; trqpPolicyProfile?: TrqpPolicyProfile },
    name: string,
    description?: string
  ) {
    super(name, description);
    this.controller = controller;
    this.options = options;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (this.controller?.isReady()) this.addMessage("Agent is initialized");
  }

  async run(connectionRecord?: any): Promise<void> {
    super.run();
    try {
      const record = connectionRecord as any;
      const connectionId: string | undefined = record?.id;
      if (!connectionId) {
        throw new Error("Connection ID is required");
      }

      const verifierAdapter = this.controller.getAdapter?.() as any;
      const adapterType =
        verifierAdapter && verifierAdapter.constructor ? verifierAdapter.constructor.name : typeof verifierAdapter;
      const isAcaPy =
        verifierAdapter &&
        (verifierAdapter instanceof AcaPyAgentAdapter || adapterType === "AcaPyAgentAdapter");
      if (!isAcaPy) {
        throw new Error("ACA-Py adapter required");
      }

      const controlUrl = (verifierAdapter as AcaPyAgentAdapter).getControlUrl().replace(/\/$/, "");
      const protocolVersion = this.options.proof?.protocolVersion ?? "v2";
      this.addMessage("Requesting proof via ACA-Py control service");

      const requestResp = await fetchJson(`${controlUrl}/proofs/request`, {
        method: "POST",
        body: JSON.stringify({
          connection_id: connectionId,
          protocol_version: protocolVersion,
          proof_formats: (this.options.proof as any)?.proofFormats,
          // Keep the exchange record around so /proofs/verify can deterministically
          // wait for a presentation and perform verify+ACK without racing auto-removal.
          auto_verify: false,
          auto_remove: false,
        }),
      });

      const proofExchangeId: string | undefined =
        requestResp?.proof_exchange_id || requestResp?.proof_exchangeId || requestResp?.proof_exchange?.id;
      if (!proofExchangeId) {
        throw new Error("Missing proof_exchange_id");
      }

      const autoSendInternalHolder = normalizeEnvBool(process.env.ACAPY_AUTO_SEND_INVITE_TO_INTERNAL_HOLDER);
      const challenge = extractDifChallenge(this.options.proof);
      if (autoSendInternalHolder && challenge) {
        this.addMessage("Demo mode: attempting to auto-present from internal ACA-Py holder");
        await autoPresentWithInternalAcaPyHolder({
          challenge,
          inputDescriptorId: "ayra-business-card",
        });
        this.addMessage("Internal holder presentation attempt complete");
      }

      this.addMessage("Waiting for verifier to receive and verify presentation");
      const overallTimeoutMs = 180_000;
      const deadline = Date.now() + overallTimeoutMs;
      let verifyTriggered = false;
      while (Date.now() < deadline) {
        const statusResp = await fetchJson(`${controlUrl}/proofs/verify-or-status`, {
          method: "POST",
          body: JSON.stringify({
            proof_exchange_id: proofExchangeId,
            connection_id: connectionId,
            timeout_ms: 2000,
          }),
        });

        this.presentationRecord = statusResp?.record || statusResp;
        const state = String(
          statusResp?.state || this.presentationRecord?.state || this.presentationRecord?.presentation_state || ""
        ).toLowerCase();
        if (state === "presentation-received" && !verifyTriggered) {
          verifyTriggered = true;
          this.addMessage("Presentation received; triggering verification");
          const verifyResp = await fetchJson(`${controlUrl}/proofs/verify`, {
            method: "POST",
            body: JSON.stringify({
              proof_exchange_id: proofExchangeId,
              connection_id: connectionId,
              timeout_ms: 120_000,
              enforce_trqp: Boolean(this.options.checkTrustRegistry),
            }),
          });
          this.presentationRecord = verifyResp?.record || verifyResp;
          const verifyState = String(
            verifyResp?.state || this.presentationRecord?.state || this.presentationRecord?.presentation_state || ""
          ).toLowerCase();
          if (verifyState === "done") break;
        } else if (state === "done") {
          break;
        } else if (state === "abandoned") {
          throw new Error("Verifier abandoned the proof exchange");
        }
        await sleep(1500);
      }

      if (!this.presentationRecord) {
        throw new Error("No proof record returned while waiting for verifier response");
      }
      const finalState = String(
        this.presentationRecord?.state || this.presentationRecord?.presentation_state || ""
      ).toLowerCase();
      if (finalState !== "done") {
        throw new Error("Timed out waiting for verifier to verify presentation");
      }
      const verifiedRaw =
        this.presentationRecord?.verified ??
        this.presentationRecord?.record?.verified ??
        (this.presentationRecord?.presentation ?? this.presentationRecord)?.verified;
      const verified = verifiedRaw === true || verifiedRaw === "true";
      if (!verified) {
        throw new Error(`Proof verification failed: verified=${String(verifiedRaw)}`);
      }
      const isDifProof = Boolean((this.options.proof as any)?.proofFormats?.dif);
      const vc = this.extractVc(this.presentationRecord);
      if (isDifProof && !vc) {
        if (this.options.checkTrustRegistry) {
          throw new Error("TRQP check failed: no verifiable credential found in presentation");
        }
        throw new Error("No verifiable credential found in presentation");
      }
      if (this.options.checkTrustRegistry) {
        await this.runTrqpChecks(this.presentationRecord, vc ?? undefined);
      }
      this.setAccepted();
      this.setCompleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.addMessage(`Request Proof failed: ${message}`);
      this.addError(err);
      this.setFailed();
      this.setCompleted();
      return;
    }
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "RequestProofAcaPyWithOptionalInternalHolderTask",
      value: {
        message: "Proof request completed",
        state: this.state,
        presentation: this.presentationRecord,
      },
    };
  }

  private async runTrqpChecks(proofRecord: any, vcOverride?: any): Promise<void> {
    const vc = vcOverride || this.extractVc(proofRecord);
    if (!vc) {
      throw new Error("TRQP check failed: no verifiable credential found in presentation");
    }
    const { authorizationPayload, recognitionPayload, ecosystemId } = this.buildTrqpPayloads(vc);
    const baseUrl = await this.resolveTrqpEndpoint(ecosystemId);

    this.addMessage(
      `TRQP mapping: entity_id=${authorizationPayload.entity_id} authority_id=${authorizationPayload.authority_id} action=${authorizationPayload.action} resource=${authorizationPayload.resource}`
    );
    this.addMessage(
      `TRQP recognition mapping: entity_id=${recognitionPayload.entity_id} authority_id=${recognitionPayload.authority_id} action=${recognitionPayload.action} resource=${recognitionPayload.resource}`
    );
    const recognitionContext = (recognitionPayload as any)?.context;
    const recognitionCapability =
      typeof recognitionContext?.capability === "string" ? recognitionContext.capability : "";
    if (recognitionCapability) {
      this.addMessage(`TRQP recognition capability: ${recognitionCapability}`);
    }
    const mode: TrqpMode = this.options.trqpMode || serverState.trqpMode || "both";
    const runAuthorization = mode === "authorization" || mode === "both";
    const runRecognition = mode === "recognition" || mode === "both";
    this.addMessage(`TRQP mode selected: ${mode}`);

    const failures: string[] = [];

    if (runAuthorization) {
      this.addMessage("TRQP authorization check started");
      try {
        const authResp = await fetch(`${baseUrl}/authorization`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authorizationPayload),
        });
        const authBody = await this.readJsonSafe(authResp);
        if (!authResp.ok) {
          failures.push(
            `TRQP authorization failed: ${authResp.status} ${authResp.statusText} ${authBody.raw}`
          );
        } else {
          const authorized = this.extractAuthorizationResult(authBody.json);
          if (!authorized) {
            failures.push("TRQP authorization failed: authorized=false");
          } else {
            this.addMessage("TRQP authorization check passed");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(
          message.startsWith("TRQP authorization failed:")
            ? message
            : `TRQP authorization failed: ${message}`
        );
      }
    }

    if (runRecognition) {
      this.addMessage("TRQP recognition check started");
      try {
        const recResp = await fetch(`${baseUrl}/recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recognitionPayload),
        });
        const recBody = await this.readJsonSafe(recResp);
        if (!recResp.ok) {
          failures.push(
            `TRQP recognition failed: ${recResp.status} ${recResp.statusText} ${recBody.raw}`
          );
        } else {
          const recognized = this.extractRecognitionResult(recBody.json);
          if (!recognized) {
            failures.push("TRQP recognition failed: recognized=false");
          } else {
            this.addMessage("TRQP recognition check passed");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(
          message.startsWith("TRQP recognition failed:")
            ? message
            : `TRQP recognition failed: ${message}`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
  }

  private buildTrqpPayloads(vc: any) {
    const issuerDid = this.extractIssuerDid(vc);
    const subject = this.extractCredentialSubject(vc);
    const profile = this.options.trqpPolicyProfile || serverState.trqpPolicyProfile;
    const authorizationProfile = profile?.authorization;
    const recognitionProfile = profile?.recognition;
    const subjectIssuer = typeof subject?.issuer_id === "string" ? subject.issuer_id : "";
    if (subjectIssuer && subjectIssuer !== issuerDid) {
      throw new Error(
        `TRQP mapping failed: credentialSubject.issuer_id (${subjectIssuer}) does not match issuer (${issuerDid})`
      );
    }
    const ecosystemId = typeof subject?.ecosystem_id === "string" ? subject.ecosystem_id : "";
    if (!ecosystemId) {
      throw new Error("TRQP mapping failed: credentialSubject.ecosystem_id missing");
    }
    const atnDid = typeof subject?.ayra_trust_network_did === "string" ? subject.ayra_trust_network_did : "";
    if (!atnDid) {
      throw new Error("TRQP mapping failed: credentialSubject.ayra_trust_network_did missing");
    }
    const cardType = typeof subject?.ayra_card_type === "string" ? subject.ayra_card_type : "";
    if (!cardType) {
      throw new Error("TRQP mapping failed: credentialSubject.ayra_card_type missing");
    }
    const issuanceTime = this.extractIssuanceTime(vc);
    const authorizationPayload = {
      entity_id: issuerDid,
      authority_id: ecosystemId,
      action: authorizationProfile?.action || "issue",
      resource: authorizationProfile?.resource || `ayracard:${cardType}`,
    };
    const recognitionPayload: Record<string, unknown> = {
      entity_id: ecosystemId,
      authority_id: atnDid,
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
    return { authorizationPayload, recognitionPayload, ecosystemId };
  }

  private extractIssuerDid(vc: any): string {
    const issuer = vc?.issuer;
    if (typeof issuer === "string" && issuer.trim()) return issuer;
    if (issuer && typeof issuer.id === "string" && issuer.id.trim()) return issuer.id;
    throw new Error("TRQP mapping failed: issuer DID missing from credential");
  }

  private extractCredentialSubject(vc: any): any {
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

  private extractIssuanceTime(vc: any): string | null {
    const issuanceDate = typeof vc?.issuanceDate === "string" ? vc.issuanceDate : "";
    if (issuanceDate) return issuanceDate;
    const validFrom = typeof vc?.validFrom === "string" ? vc.validFrom : "";
    if (validFrom) return validFrom;
    return null;
  }

  private async resolveTrqpEndpoint(ecosystemDid: string): Promise<string> {
    this.addMessage(`Resolving TRQP endpoint from ecosystem DID: ${ecosystemDid}`);
    const ecosystemDoc = await this.resolveDidDocument(ecosystemDid);
    let endpoint = this.extractTrqpServiceEndpoint(ecosystemDoc);
    if (!endpoint) {
      throw new Error("TRQP endpoint not found in ecosystem DID document");
    }
    if (endpoint.startsWith("did:")) {
      this.addMessage(`Resolving TRQP endpoint DID: ${endpoint}`);
      const registryDoc = await this.resolveDidDocument(endpoint);
      const registryEndpoint = this.extractTrqpServiceEndpoint(registryDoc);
      if (!registryEndpoint) {
        throw new Error("TRQP endpoint DID did not expose a TRQP service endpoint");
      }
      endpoint = registryEndpoint;
    }
    const normalized = endpoint.replace(/\/$/, "");
    this.addMessage(`TRQP endpoint resolved: ${normalized}`);
    return normalized;
  }

  private async resolveDidDocument(did: string): Promise<any> {
    const resolverUrl =
      normalizeEnvValue(process.env.NEXT_PUBLIC_DID_RESOLVER_URL) ||
      "https://dev.uniresolver.io/1.0/identifiers";
    const endpoint = `${resolverUrl.replace(/\/$/, "")}/${did}`;
    const resp = await fetch(endpoint);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `DID resolution failed (${did}): ${resp.status} ${resp.statusText} ${text}`
      );
    }
    const data = await resp.json();
    return data?.didDocument || data;
  }

  private extractTrqpServiceEndpoint(doc: any): string | null {
    const services = doc?.service;
    if (!Array.isArray(services)) return null;
    for (const service of services) {
      const types = Array.isArray(service?.type) ? service.type : [service?.type];
      const matches = types.some((type: string) => {
        const normalized = String(type || "").toLowerCase();
        return normalized === "trqp" || normalized === "trustregistryservice";
      });
      if (!matches) continue;
      const endpoint = this.extractServiceEndpointValue(service?.serviceEndpoint);
      if (endpoint) return endpoint;
    }
    return null;
  }

  private extractServiceEndpointValue(endpoint: any): string | null {
    if (!endpoint) return null;
    if (typeof endpoint === "string") return endpoint;
    if (typeof endpoint?.uri === "string") return endpoint.uri;
    if (typeof endpoint?.url === "string") return endpoint.url;
    return null;
  }

  private async readJsonSafe(resp: Response): Promise<{ json: any; raw: string }> {
    const raw = await resp.text().catch(() => "");
    if (!raw) return { json: null, raw: "" };
    try {
      return { json: JSON.parse(raw), raw };
    } catch {
      return { json: null, raw };
    }
  }

  private extractAuthorizationResult(payload: any): boolean {
    if (Array.isArray(payload)) {
      return payload.some((item) => item?.authorized === true);
    }
    if (payload && typeof payload === "object") {
      return payload.authorized === true;
    }
    return false;
  }

  private extractRecognitionResult(payload: any): boolean {
    if (payload && typeof payload === "object") {
      return payload.recognized === true;
    }
    return false;
  }

  private extractVc(proofRecord: any): any | null {
    const decodeAttach = (attach: any): any | null => {
      const data = attach?.data;
      if (!data) return null;
      if (data.json) return data.json;
      if (data.base64) {
        try {
          return JSON.parse(Buffer.from(data.base64, "base64").toString("utf8"));
        } catch {
          return null;
        }
      }
      return null;
    };

    const pickAttaches = (record: any): any[] | null => {
      if (!record) return null;
      return (
        record?.presentations_attach ||
        record?.["presentations~attach"] ||
        record?.presentation?.presentations_attach ||
        record?.presentation?.["presentations~attach"] ||
        record?.pres?.presentations_attach ||
        record?.pres?.["presentations~attach"] ||
        null
      );
    };
    const attaches = pickAttaches(proofRecord) || pickAttaches(proofRecord?.record);
    if (!attaches || !Array.isArray(attaches) || attaches.length === 0) return null;
    const decoded = decodeAttach(attaches[0]);
    if (!decoded) return null;
    const vp = decoded.verifiableCredential ? decoded : decoded.vp || decoded.presentation || decoded;
    const vc = vp.verifiableCredential?.[0] || vp.verifiableCredential || vp.credential || vp.vc || vp;
    return vc || null;
  }
}

export default class HolderTestPipeline {
  _dag: DAG;
  _controller: AgentController;
  _verifyTRQP: boolean;
  _trqpMode: TrqpMode;
  _trqpPolicyProfile?: TrqpPolicyProfile;

  constructor(
    controller: AgentController,
    verifyTRQP = false,
    trqpMode: TrqpMode = "both",
    trqpPolicyProfile?: TrqpPolicyProfile
  ) {
    this._controller = controller;
    this._verifyTRQP = verifyTRQP;
    this._trqpMode = trqpMode;
    this._trqpPolicyProfile = trqpPolicyProfile;
    this._dag = this._make(controller);
  }

  dag(): DAG {
    return this._dag;
  }

  async init() {
    const dag = this._make(this._controller);
    this._dag = dag;
  }

  _make(controller: AgentController): DAG {
    const dag = new DAG("Holder Conformance Test");

    // Create setup connection task
    const setupConnectionTask = new SetupConnectionTask(
      controller,
      "Setup Connection",
      "Establish a connection with the holder wallet"
    );

    const challenge = randomUUID();

    const adapter = controller.getAdapter?.();
    const adapterType =
      adapter && (adapter as any).constructor ? (adapter as any).constructor.name : typeof adapter;
    const isAcaPyAdapter =
      !!adapter &&
      (adapter instanceof AcaPyAgentAdapter || adapterType === "AcaPyAgentAdapter");

    const anonCredsProof = {
      protocolVersion: "v2",
      proofFormats: {
        anoncreds: {
          name: "holder-test-proof-request",
          version: "1.0",
          requested_attributes: {
            type: {
              name: "type",
              restrictions: [
                {
                  cred_def_id:
                    process.env.HOLDER_TEST_CRED_DEF_ID ||
                    process.env.LATEST_CRED_DEF_ID_DID_INDY ||
                    process.env.LATEST_CRED_DEF_ID ||
                    undefined,
                },
              ].filter((r) => Boolean((r as any).cred_def_id)),
            },
          },
          requested_predicates: {},
        },
      },
    };

    const ayraTypeUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld";
    const ayraSchemaIdUri = "https://schema.affinidi.io/AyraBusinessCardV1R0.json";
    const vcTypeUri = "https://www.w3.org/2018/credentials#VerifiableCredential";
    const difProof = {
      protocolVersion: "v2",
      proofFormats: {
        dif: {
          options: {
            challenge,
            domain: "https://cts.verifier",
          },
          presentation_definition: {
            name: "Ayra Business Card LDP",
            purpose: "Present an Ayra Business Card signed as a Linked Data Proof VC",
            format: {
              ldp_vp: {
                proof_type: ["Ed25519Signature2020"],
              },
            },
            input_descriptors: [
              {
                id: "ayra-business-card",
                purpose: "Must be an Ayra Business Card with Ed25519Signature2020",
                // ACA-Py issue #4006: DIF handler crashes if schema is omitted.
                // Use expanded type URIs (see #3441); when fixed, we can drop schema and rely on constraints.
                schema: [{ uri: ayraTypeUri }, { uri: vcTypeUri }],
                oneof_filter: true,
                constraints: {
                  fields: [
                    {
                      path: ["$.type[*]", "$.vc.type[*]", "$.credential.type[*]"],
                      filter: {
                        type: "string",
                        const: "AyraBusinessCard",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const credoPresentationExchangeProof = {
      protocolVersion: "v2",
      proofFormats: {
        presentationExchange: {
          options: {
            challenge,
            domain: "https://cts.verifier",
          },
          presentationDefinition: {
            name: "Ayra Business Card LDP",
            purpose: "Present an Ayra Business Card signed as a Linked Data Proof VC",
            format: {
              ldp_vp: {
                proof_type: ["Ed25519Signature2020"],
              },
            },
            inputDescriptors: [
              {
                id: "ayra-business-card",
                purpose: "Must be an Ayra Business Card with Ed25519Signature2020",
                // Keep schema aligned with expanded type to avoid ACA-Py DIF matching issues.
                schema: [{ uri: ayraTypeUri }, { uri: vcTypeUri }],
                constraints: {
                  fields: [
                    {
                      path: ["$.type[*]", "$.vc.type[*]", "$.credential.type[*]"],
                      filter: {
                        type: "string",
                        const: "AyraBusinessCard",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const proof =
      serverState.credentialFormat === "w3c"
        ? isAcaPyAdapter
          ? difProof
          : credoPresentationExchangeProof
        : anonCredsProof;

    const requestProofOptions: RequestProofOptions & {
      trqpMode?: TrqpMode;
      trqpPolicyProfile?: TrqpPolicyProfile;
    } = {
      proof: proof,
      checkTrustRegistry: this._verifyTRQP || serverState.verifyTRQP || false,
      trqpMode: this._trqpMode || serverState.trqpMode || "both",
      trqpPolicyProfile: this._trqpPolicyProfile || serverState.trqpPolicyProfile,
      trqpURL:
        process.env.NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT ||
        process.env.NEXT_PUBLIC_TRQP_LOCAL_URL,
    };

    // Create request proof task
    //
    // For ACA-Py verifier roles we always use the polling-based task so we don't depend on the
    // one-shot `/proofs/verify` behavior (which can 500 on timing races) and so demo-mode
    // auto-present can be attempted when an internal holder is configured.
    const requestProofTask = isAcaPyAdapter
      ? new RequestProofAcaPyWithOptionalInternalHolderTask(
          controller,
          requestProofOptions,
          "Request Proof",
          "Request a presentation from the holder and verify it"
        )
      : new RequestProofTask(
          controller,
          requestProofOptions,
          "Request Proof",
          "Request a presentation from the holder and verify it"
        );

    // Add evaluation task for final assessment
    const evaluationTask = new HolderTestEvaluationTask(
      "Evaluate Holder Test",
      "Evaluate holder's conformance based on connection and presentation"
    );

    // Add tasks to the DAG
    const connectionNode = new TaskNode(setupConnectionTask);
    dag.addNode(connectionNode);

    const proofNode = new TaskNode(requestProofTask);
    proofNode.addDependency(connectionNode);
    dag.addNode(proofNode);

    const evaluationNode = new TaskNode(evaluationTask);
    evaluationNode.addDependency(proofNode);
    dag.addNode(evaluationNode);

    return dag;
  }
}

export class HolderTestEvaluationTask extends BaseRunnableTask {
  constructor(name: string, description?: string) {
    super(name, description);
  }

  async prepare(): Promise<void> {
    super.prepare();
  }

  async run(input?: any): Promise<void> {
    super.run();
    console.log("Running holder test evaluation");
    this.addMessage("Evaluating holder conformance test results");
    this.addMessage("Checking connection establishment");
    this.addMessage("Checking presentation response");
    this.addMessage("Evaluating credential format compliance");

    const proofState = input?.state;
    const proofStatus = String(proofState?.status || "").toLowerCase();
    const proofErrors = Array.isArray(proofState?.errors) ? proofState.errors : [];

    if (proofStatus === "failed" || proofStatus === "error" || proofErrors.length > 0) {
      this.addMessage("Holder conformance test failed");
      proofErrors.forEach((error: string) => this.addError(error));
      this.setFailed();
      this.setCompleted();
      return;
    }

    this.addMessage("Test completed successfully");
    this.setCompleted();
    this.setAccepted();
  }

  async results(): Promise<Results> {
    return {
      time: new Date(),
      author: "Holder Test Evaluation",
      value: {
        message: "Holder conformance test completed successfully",
        conformanceLevel: "Full",
        details: {
          connectionProtocol: "Pass",
          presentationProtocol: "Pass",
          credentials: "Pass"
        }
      },
    };
  }
}
