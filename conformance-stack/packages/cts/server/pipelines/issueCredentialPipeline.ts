import { AgentController, indyNetworkConfig } from "@demo/core";
import { TaskNode } from "@demo/core/pipeline/src/nodes";

import {
  CredentialIssuanceOptions,
  IssueCredentialTask,
  SetupConnectionTask,
} from "@demo/core";

import { DAG } from "@demo/core/pipeline/src/dag";

export default class IssueCredentialPipeline {
  _dag: DAG;
  _controller: AgentController;
  _did: string;
  private static FALLBACK_CRED_DEF =
    process.env.HOLDER_TEST_CRED_DEF_ID ||
    "did:indy:bcovrin:test:HYfhCRaKhccZtr7v8CHTe8/anoncreds/v0/CLAIM_DEF/2815242/latest";

  constructor(controller: AgentController) {
    this._controller = controller;
    this._did = this.getDefaultDid();
    this._dag = this._make(this._controller, this._did);
  }

  private getDefaultDid(): string {
    const unqualifiedIndyDid = "HYfhCRaKhccZtr7v8CHTe8";
    const indyDid = `did:indy:${indyNetworkConfig.indyNamespace}:${unqualifiedIndyDid}`;
    return indyDid;
  }

  dag(): DAG {
    return this._dag;
  }

  async init() {
    // Controller initialization handled upstream
  }

  _make(controller: AgentController, did: string): DAG {
    const dag = new DAG("Issue GAN Credential Pipeline");

    const setupConnectionTask = new SetupConnectionTask(
      controller,
      "Scan To Connect",
      "Set a DIDComm connection between GAN Verifier App and Holder"
    );
    const issueCredentialOptions: CredentialIssuanceOptions =
      this.buildIssuanceOptions(did);

    const requestCredential = new IssueCredentialTask(
      controller,
      {
        ...issueCredentialOptions,
      },
      "Issue GAN Employee Credential",
      "Issue GAN Employee Credential"
    );

    // Add tasks to the DAG
    const connectionNode = new TaskNode(setupConnectionTask);
    dag.addNode(connectionNode);

    const requestCredentialNode = new TaskNode(requestCredential);
    requestCredentialNode.addDependency(connectionNode);
    dag.addNode(requestCredentialNode);
    return dag;
  }

  private buildIssuanceOptions(did: string): CredentialIssuanceOptions {
    const options: CredentialIssuanceOptions = {
      did,
      didSeed: "afjd3mov1rysercure03020004000000",
    };

    const schemaId =
      process.env.ISSUER_SCHEMA_ID ?? process.env.LATEST_SCHEMA_ID ?? undefined;
    if (schemaId) {
      options.schemaId = schemaId;
    }

    const credDefId =
      process.env.ISSUER_CRED_DEF_ID ?? process.env.LATEST_CRED_DEF_ID ?? undefined;
    if (credDefId) {
      options.credentialDefinitionId = credDefId;
    }

    const normalizeEnvChoice = (value: string | undefined, fallback: string): string =>
      (value ?? fallback).split("#")[0].trim().split(/\s+/)[0].toLowerCase();

    const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
    const overrideAgent = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
    const effectiveAgent = normalizeEnvChoice(process.env.ISSUER_EFFECTIVE_AGENT, "");
    const issuerAgent =
      effectiveAgent ||
      (overrideAgent === "auto" ? referenceAgent : overrideAgent);

    if (issuerAgent === "acapy" && !options.credentialDefinitionId) {
      options.credentialDefinitionId = IssueCredentialPipeline.FALLBACK_CRED_DEF;
      console.warn(
        `[IssueCredentialPipeline] No credential definition id set for ACA-Py; using fallback ${options.credentialDefinitionId}. ` +
          "Set ISSUER_CRED_DEF_ID or LATEST_CRED_DEF_ID to override."
      );
    }

    return options;
  }
}
