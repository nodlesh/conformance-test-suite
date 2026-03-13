import BaseRunnableTask from "../../pipeline/src/tasks/baseRunnableTask";
import { v4 } from "uuid";
import { Results } from "../../pipeline/src/types";
import { RunnableState } from "../../pipeline/src/types";
import { AgentController } from "../controller";
import type { ControllerConnectionRecord, CredentialOfferResult } from "../controller/types";

export type CredentialIssuanceOptions = {
  did: string;
  didSeed?: string;
  schemaId?: string;
  credentialDefinitionId?: string;
};

const schemaNameBase = "AyraCard";
const credentialDisplayName = "Ayra Card";
const credentialDefinitionTag = "ayra-card";

export class IssueCredentialTask extends BaseRunnableTask {
  private controller: AgentController;
  private result: RunnableState;
  private _options: CredentialIssuanceOptions;
  private issuanceResult?: CredentialOfferResult;

  constructor(
    controller: AgentController,
    options: CredentialIssuanceOptions,
    name: string,
    description?: string
  ) {
    super(name, description);
    this.controller = controller;
    this._options = options;
    this.result = RunnableState.NOT_STARTED;
  }

  async prepare(): Promise<void> {
    super.prepare();
    if (!this.controller) {
      super.addError("controller wasn't defined");
      throw new Error("Agent controller is not defined");
    }
    if (!this.controller.isReady()) {
      this.addMessage("Waiting for controller to become ready");
    } else {
      this.addMessage("Controller is initialized");
    }
    if (!this._options.did) {
      throw new Error("Issuer DID is required for credential issuance");
    }
  }

  async run(connectionRecord?: any): Promise<void> {
    super.run();
    try {
      const record = connectionRecord as ControllerConnectionRecord;
      const connectionId = record?.id;

      if (!connectionId) {
        this.addError("Connection ID is required");
        throw new Error("Connection ID is required");
      }
      if (!this.controller?.isReady()) {
        this.addError("controller wasn't ready");
        throw new Error("Agent controller is not ready");
      }
      this.addMessage("Issuing credential via controller");

      const schemaTemplate = this._options.schemaId
        ? undefined
        : {
            name: `${schemaNameBase}-${v4().replace(/-/g, "")}`,
            version: "1.0.0",
            attrNames: ["type"],
          };

      this.issuanceResult = await this.controller.issueCredential({
        connectionId,
        issuerDid: this._options.did,
        didSeed: this._options.didSeed,
        schemaTemplate,
        schemaId: this._options.schemaId,
        credentialDefinitionId: this._options.credentialDefinitionId,
        credentialDefinitionTag,
        attributes: [
          {
            name: "type",
            value: credentialDisplayName,
          },
        ],
      });

      const schemaId =
        this.issuanceResult?.schemaId ?? this._options.schemaId;
      const legacySchemaId =
        this.issuanceResult?.legacySchemaId ?? schemaId;
      const credDefId =
        this.issuanceResult?.credentialDefinitionId ??
        this._options.credentialDefinitionId;
      const legacyCredDefId =
        this.issuanceResult?.legacyCredentialDefinitionId ?? credDefId;

      if (schemaId) {
        process.env.LATEST_SCHEMA_ID_DID_INDY = schemaId;
      }
      if (legacySchemaId) {
        process.env.LATEST_SCHEMA_ID = legacySchemaId;
      }
      if (credDefId) {
        process.env.LATEST_CRED_DEF_ID_DID_INDY = credDefId;
      }
      if (legacyCredDefId) {
        process.env.LATEST_CRED_DEF_ID = legacyCredDefId;
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
      author: "IssueCredentialTask",
      value: {
        message: "Credential issued successfully",
        state: this.state,
        result: this.issuanceResult,
      },
    };
  }
}
