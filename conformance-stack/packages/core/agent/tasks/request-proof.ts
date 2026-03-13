import BaseRunnableTask from "../../pipeline/src/tasks/baseRunnableTask";
import { Configuration } from "@demo/trqp/gen/api-client";
import type { RequestProofOptions as CredoRequestProofOptions } from "@credo-ts/core";
import { Results } from "../../pipeline/src/types";
import { RunnableState } from "../../pipeline/src/types";
import { AgentController } from "../controller";
import type { ControllerConnectionRecord } from "../controller/types";

const normalizeEnvValue = (value?: string): string => (value ?? "").split("#")[0].trim();

type RequestProofOptionsWithoutConnectionId = Omit<
  CredoRequestProofOptions,
  "connectionId"
> & {
  connectionId?: string;
};

export type RequestProofOptions = {
  checkTrustRegistry: boolean;
  trqpURL?: string;
  proof: RequestProofOptionsWithoutConnectionId;
  checkGANTR?: boolean;
};

export class RequestProofTask extends BaseRunnableTask {
  private controller: AgentController;
  private _options: RequestProofOptions;
  private _presentationRecord: any;

  constructor(
    controller: AgentController,
    options: RequestProofOptions,
    name: string,
    description?: string
  ) {
    super(name, description);
    this.controller = controller;
    this._options = options;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (!this.controller) {
      super.addError("controller wasn't defined");
      throw new Error("Agent controller is not defined");
    }
    if (this.controller.isReady()) {
      this.addMessage("Agent is initialized");
    }
  }

  async run(connectionRecord?: any): Promise<void> {
    super.run();
    try {
      const record = connectionRecord as ControllerConnectionRecord;
      const connectionId = record.id;

      if (connectionId === undefined) {
        this.addError("Connection ID is required");
        throw new Error("Connection ID is required");
      }

      const connStr = connectionId as string;
      if (!this.controller) {
        this.addError("controller wasn't defined");
        throw new Error("Agent controller is not defined");
      }
      this.addMessage("Requesting proof via controller");

      const proofRecord = await this.controller.requestProof(connStr, this._options.proof);
      this._presentationRecord = proofRecord;
      if (this._options.checkTrustRegistry) {
        await this.runTrqpChecks(proofRecord);
      }
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
      author: "RequestProofTask",
      value: {
        message: "Proof request completed successfully",
        state: this.state,
        presentation: this._presentationRecord,
      },
    };
  }

  private async runTrqpChecks(proofRecord: any): Promise<void> {
    const baseUrl =
      this._options.trqpURL ||
      process.env.NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT ||
      process.env.NEXT_PUBLIC_TRQP_LOCAL_URL;
    if (!baseUrl) {
      this.addMessage("TRQP check skipped: no TRQP endpoint configured");
      return;
    }
    const vc = this.extractVc(proofRecord);
    if (!vc) {
      this.addError("TRQP check skipped: no verifiable credential found in presentation");
      return;
    }
    const entityId = normalizeEnvValue(process.env.TRQP_ENTITY_ID);
    const authorityId = normalizeEnvValue(process.env.TRQP_AUTHORITY_ID);
    const action = normalizeEnvValue(process.env.TRQP_ACTION);
    const resource = normalizeEnvValue(process.env.TRQP_RESOURCE);
    const contextRaw = normalizeEnvValue(process.env.TRQP_CONTEXT_JSON);

    const missing = [];
    if (!entityId) missing.push("TRQP_ENTITY_ID");
    if (!authorityId) missing.push("TRQP_AUTHORITY_ID");
    if (!action) missing.push("TRQP_ACTION");
    if (!resource) missing.push("TRQP_RESOURCE");
    if (missing.length > 0) {
      throw new Error(`TRQP check failed: missing required fields (${missing.join(", ")})`);
    }

    let context: any | undefined;
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw);
      } catch {
        context = contextRaw;
      }
    }

    const payload: Record<string, unknown> = {
      entity_id: entityId,
      authority_id: authorityId,
      action,
      resource,
    };
    if (context !== undefined) payload.context = context;

    // Authorization check
    this.addMessage("TRQP authorization check started");
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/authorization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`TRQP authorization failed: ${resp.status} ${text}`);
      }
      this.addMessage("TRQP authorization check passed");
    } catch (err) {
      this.addError(`TRQP authorization failed: ${err}`);
      throw err;
    }

    // Recognition check
    this.addMessage("TRQP recognition check started");
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`TRQP recognition failed: ${resp.status} ${text}`);
      }
      this.addMessage("TRQP recognition check passed");
    } catch (err) {
      this.addError(`TRQP recognition failed: ${err}`);
      throw err;
    }
  }

  private extractVc(proofRecord: any): any | null {
    const attaches =
      proofRecord?.presentation?.presentations_attach ||
      proofRecord?.pres?.presentations_attach ||
      proofRecord?.presentations_attach;
    if (!attaches || !attaches.length) return null;
    const data = attaches[0]?.data;
    if (!data) return null;
    const b64 = data.base64;
    if (!b64) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(b64, "base64").toString("utf8")
      );
      const vc =
        decoded.verifiableCredential?.[0] ||
        decoded.verifiableCredential ||
        decoded;
      return vc;
    } catch {
      return null;
    }
  }
}
