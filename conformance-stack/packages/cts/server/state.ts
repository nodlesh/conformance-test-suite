import { DAG } from "@demo/core/pipeline/src/dag";
import { BaseAgent, AgentConfiguration, AgentController } from "@demo/core";
import {
  HolderTestPipeline,
  VerifierTestPipeline,
  VerifierAcaPyPipeline,
  RegistryTestPipeline,
  IssueCredentialPipeline,
} from "./pipelines";
import { PipelineType } from "./pipelines";
import { AcaPyAgentAdapter } from "@demo/core";

export type Pipeline = {
  init(): Promise<void>;
  dag(): DAG;
};

export type TrqpMode = "authorization" | "recognition" | "both";
export type TrqpPolicyBindingProfile = {
  action?: string;
  resource?: string;
  capability?: string;
};
export type TrqpPolicyProfile = {
  authorization?: TrqpPolicyBindingProfile;
  recognition?: TrqpPolicyBindingProfile;
};

export type State = {
  dag?: DAG;
  config?: AgentConfiguration;
  pipeline?: Pipeline;
  currentInvitation?: string;
  agent?: BaseAgent;
  credoController?: AgentController;
  controller?: AgentController;
  issuerController?: AgentController;
  issuerAgentType?: "credo" | "acapy";
  credentialFormat?: "anoncreds" | "w3c";
  verifyTRQP?: boolean;
  verifierController?: AgentController;
  lastIssuedCredentialId?: string;
  lastIssuedCredentialSource?: string;
  lastIssuedWalletRecordId?: string;
  holderPresentationDid?: string;
  trqpMode?: TrqpMode;
  trqpPolicyProfile?: TrqpPolicyProfile;
};

const _state: State = {};

const normalizeEnvValue = (value?: string): string => (value ?? "").split("#")[0].trim();
const normalizeEnvChoice = (value: string | undefined, fallback: string): string =>
  normalizeEnvValue(value || fallback).split(/\s+/)[0].toLowerCase();

// NOTE: Do not set a default credential format at module load time. The server entrypoint
// applies defaults after dotenv has been loaded, and the UI can override via `/api/card-format`.

export const setDAG = (dag: DAG) => {
  _state.dag = dag;
};

export const setPipeline = (pipeline: Pipeline) => {
  console.log("[STATE] Setting pipeline:", pipeline?.constructor?.name);
  _state.pipeline = pipeline;
};

export const setAgent = (agent: BaseAgent) => {
  _state.agent = agent;
};

export const setController = (controller: AgentController) => {
  _state.controller = controller;
};
export const setCredoController = (controller?: AgentController) => {
  _state.credoController = controller;
};
export const setIssuerController = (controller?: AgentController) => {
  _state.issuerController = controller;
};
export const setVerifierController = (controller?: AgentController) => {
  _state.verifierController = controller;
};

export const setLastIssuedCredentialId = (
  id?: string,
  source?: string
): void => {
  _state.lastIssuedCredentialId = id;
  _state.lastIssuedCredentialSource = source;
};

export const setLastIssuedWalletRecordId = (id?: string): void => {
  _state.lastIssuedWalletRecordId = id;
  if (id) {
    _state.lastIssuedCredentialSource = "wallet-record";
  }
};

export const setIssuerAgentType = (
  type?: "credo" | "acapy"
): void => {
  _state.issuerAgentType = type;
};

export const setCredentialFormat = (
  format: "anoncreds" | "w3c"
): void => {
  _state.credentialFormat = format;
};

export const setConfig = (config: AgentConfiguration) => {
  _state.config = config;
};

export const setVerifyTRQP = (flag?: boolean) => {
  _state.verifyTRQP = flag;
};

export const setTrqpMode = (mode?: TrqpMode) => {
  _state.trqpMode = mode;
};

export const setTrqpPolicyProfile = (profile?: TrqpPolicyProfile) => {
  _state.trqpPolicyProfile = profile;
};

export { _state as state };

export const selectPipeline = (type: PipelineType): Pipeline => {
  console.log("[STATE] Selecting pipeline type:", type);
  var pipe: Pipeline;
  switch (type) {
    case PipelineType.HOLDER_TEST:
      {
        const override = normalizeEnvChoice(process.env.REFERENCE_VERIFIER_OVERRIDE_AGENT, "auto");
        // Default behavior: `auto` follows REFERENCE_AGENT. Mixed-mode runs are enabled by setting an override
        // different from REFERENCE_AGENT (e.g. reference=acapy, override=credo).
        const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
        const desired = override === "auto" ? referenceAgent : override;

        let controller: AgentController | undefined;
        if (desired === "credo") {
          controller = _state.credoController;
          if (!controller) {
            throw new Error(
              "Holder flow requires a Credo verifier controller, but it is not initialized. " +
                "Start CTS with the Credo agent enabled or set REFERENCE_VERIFIER_OVERRIDE_AGENT=acapy."
            );
          }
        } else if (desired === "acapy") {
          // For an ACA-Py verifier role, prefer a dedicated verifier controller if configured,
          // otherwise fall back to the ACA-Py issuer controller (it can still run verifier steps).
          controller = _state.verifierController || _state.issuerController;
          if (!controller) {
            // As a last resort, use the reference controller if it's ACA-Py.
            const adapter = _state.controller?.getAdapter?.();
            const adapterType =
              adapter && (adapter as any).constructor ? (adapter as any).constructor.name : typeof adapter;
            const isAcaPyAdapter =
              !!adapter &&
              (adapter instanceof AcaPyAgentAdapter || adapterType === "AcaPyAgentAdapter");
            if (isAcaPyAdapter) {
              controller = _state.controller;
            }
          }
          if (!controller) {
            throw new Error(
              "Holder flow requested an ACA-Py verifier (REFERENCE_VERIFIER_OVERRIDE_AGENT=acapy), " +
                "but no ACA-Py controller is available for verifier steps. Ensure ACAPY_CONTROL_URL is configured."
            );
          }
        } else {
          throw new Error(
            `Unsupported REFERENCE_VERIFIER_OVERRIDE_AGENT=${override}. Expected 'auto', 'credo', or 'acapy'.`
          );
        }

        if (!controller) {
          throw new Error("agent controller not defined");
        }
        pipe = new HolderTestPipeline(
          controller,
          _state.verifyTRQP ?? false,
          _state.trqpMode,
          _state.trqpPolicyProfile
        );
      }
      break;
    case PipelineType.ISSUER_TEST:
      const issuerController = _state.issuerController ?? _state.controller;
      if (!issuerController) {
        throw new Error("agent controller not defined");
      }
      {
        const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
        const issuerOverride = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
        const effectiveIssuerType =
          _state.issuerAgentType ??
          (issuerOverride === "auto" ? referenceAgent : issuerOverride);
        if (effectiveIssuerType !== "acapy" && effectiveIssuerType !== "credo") {
          throw new Error(
            `Unsupported REFERENCE_ISSUER_OVERRIDE_AGENT=${issuerOverride}. Expected 'auto', 'credo', or 'acapy'.`
          );
        }
        const allowAcaPyAnonCreds =
          normalizeEnvChoice(process.env.ALLOW_ACAPY_ANONCREDS, "false") === "true";
        const issuerAdapter = issuerController.getAdapter?.();
        const issuerAdapterType =
          issuerAdapter && issuerAdapter.constructor
            ? issuerAdapter.constructor.name
            : typeof issuerAdapter;
        const isAcaPyIssuerAdapter =
          !!issuerAdapter &&
          (issuerAdapter instanceof AcaPyAgentAdapter ||
            issuerAdapterType === "AcaPyAgentAdapter");

        const selectedFormat =
          _state.credentialFormat ??
          (effectiveIssuerType === "acapy" ? "w3c" : "anoncreds");
        console.log(
          `[STATE] Issuer selection: issuerAgentType=${_state.issuerAgentType ?? "unset"} ` +
            `effectiveIssuerType=${effectiveIssuerType} issuerAdapter=${issuerAdapterType} ` +
            `credentialFormat=${selectedFormat} referenceAgent=${referenceAgent} allowAcaPyAnonCreds=${allowAcaPyAnonCreds}`
        );

        if (selectedFormat === "w3c") {
          if (effectiveIssuerType !== "acapy" || !isAcaPyIssuerAdapter) {
            throw new Error(
              `[STATE] W3C issuance requires an ACA-Py issuer controller, but issuerAgentType=${effectiveIssuerType} issuerAdapter=${issuerAdapterType}. ` +
                "Set REFERENCE_AGENT=acapy (or REFERENCE_ISSUER_OVERRIDE_AGENT=acapy) to use the ACA-Py VC-API issuer."
            );
          }
          const { IssueAcaPyW3CPipeline } = require("./pipelines");
          pipe = new IssueAcaPyW3CPipeline(issuerController);
          break;
        }

        if (selectedFormat === "anoncreds") {
          if (effectiveIssuerType === "acapy" && !allowAcaPyAnonCreds) {
            throw new Error(
              "[STATE] AnonCreds issuance with ACA-Py requires an AnonCreds-enabled profile. " +
                "Set ALLOW_ACAPY_ANONCREDS=true or switch the card format to W3C."
            );
          }
          pipe = new IssueCredentialPipeline(issuerController);
          break;
        }
        throw new Error(
          `[STATE] Unsupported credential format '${String(selectedFormat)}'. Expected 'w3c' or 'anoncreds'.`
        );
      }
      // (breaks happen above)
    case PipelineType.VERIFIER_TEST:
      {
        const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
        const adapter = _state.controller?.getAdapter?.();
        const adapterType =
          adapter && (adapter as any).constructor ? (adapter as any).constructor.name : typeof adapter;
        const isAcaPyAdapter =
          !!adapter &&
          (adapter instanceof AcaPyAgentAdapter || adapterType === "AcaPyAgentAdapter");
        if (_state.verifyTRQP && referenceAgent !== "acapy") {
          throw new Error(
            "Verifier TRQP enforcement requires an ACA-Py holder (set REFERENCE_AGENT=acapy)."
          );
        }
        if (referenceAgent === "acapy" && isAcaPyAdapter) {
          if (!_state.controller) {
            throw new Error("agent controller not defined");
          }
          // In demo mode we can optionally use an internal ACA-Py verifier controller to auto-send the proof request.
          pipe = new VerifierAcaPyPipeline(_state.controller, undefined, _state.verifierController, {
            verifyTrqp: _state.verifyTRQP ?? false,
            trqpMode: _state.trqpMode,
            trqpPolicyProfile: _state.trqpPolicyProfile,
          });
          break;
        }
        if (!_state.agent) {
          throw new Error("agent not defined");
        }
        pipe = new VerifierTestPipeline(_state.agent);
      }
      break;
    case PipelineType.REGISTRY_TEST:
      if (!_state.agent) {
        throw new Error("agent not defined");
      }
      pipe = new RegistryTestPipeline(_state.agent);
      break;
    default:
      throw new Error(`could not find pipeline type ${type}`);
  }
  setPipeline(pipe);
  setDAG(pipe.dag());
  return pipe;
};
