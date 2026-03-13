// Ensure ngrok reads this path at module-load time
process.env.NGROK_CONFIG = process.env.NGROK_CONFIG || "/tmp/ngrok.yml";
// server.ts
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { state } from './state';
import VerifierTestPipeline from './pipelines/verifierTestPipeline';

import { createAgentConfig, BaseAgent, AgentController, CredoAgentAdapter, AcaPyAgentAdapter } from "@demo/core";
import * as ngrok from "@ngrok/ngrok";
import type { Config as NgrokConfig } from "@ngrok/ngrok";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from "uuid";
import {
  setDAG,
  setPipeline,
  setConfig,
  setAgent,
  setController,
  setCredoController,
  setIssuerController,
  setVerifierController,
  setIssuerAgentType,
  setCredentialFormat,
  setTrqpMode,
  setTrqpPolicyProfile,
  state as serverState,
  type TrqpMode,
  type TrqpPolicyBindingProfile,
  type TrqpPolicyProfile,
} from "./state";
import { PipelineType } from "./pipelines";
import { runServer } from "./api";
import { emitDAGUpdate } from "./ws";
import { selectPipeline } from "./state";

const normalizeEnvValue = (value?: string): string =>
  (value ?? "").split("#")[0].trim();

const normalizeEnvChoice = (value: string | undefined, fallback: string): string =>
  normalizeEnvValue(value || fallback).split(/\s+/)[0].toLowerCase();

const normalizeProfile = (value: string | undefined, fallback: "issuer" | "verifier" | "holder") => {
  const v = normalizeEnvChoice(value, fallback);
  if (v === "issuer" || v === "verifier" || v === "holder") return v;
  return fallback;
};

const normalizeTrqpMode = (value: unknown): TrqpMode | null => {
  const normalized = normalizeEnvChoice(typeof value === "string" ? value : undefined, "");
  if (normalized === "authorization" || normalized === "recognition" || normalized === "both") {
    return normalized;
  }
  return null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizePolicyBinding = (value: unknown): TrqpPolicyBindingProfile | undefined => {
  if (!isObject(value)) return undefined;
  const action = normalizeEnvValue(typeof value.action === "string" ? value.action : "");
  const resource = normalizeEnvValue(typeof value.resource === "string" ? value.resource : "");
  const capability = normalizeEnvValue(typeof value.capability === "string" ? value.capability : "");
  const normalized: TrqpPolicyBindingProfile = {};
  if (action) normalized.action = action;
  if (resource) normalized.resource = resource;
  if (capability) normalized.capability = capability;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeTrqpPolicyProfile = (value: unknown): TrqpPolicyProfile | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isObject(value)) {
    throw new Error("trqpPolicyProfile must be an object");
  }
  const authorization = normalizePolicyBinding(value.authorization);
  const recognition = normalizePolicyBinding(value.recognition);
  const normalized: TrqpPolicyProfile = {};
  if (authorization) normalized.authorization = authorization;
  if (recognition) normalized.recognition = recognition;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};


function ensureNgrokConfig(): string {
  const token = process.env.NGROK_AUTH_TOKEN || process.env.NGROK_AUTHTOKEN;
  if (!token) throw new Error("NGROK_AUTH_TOKEN not defined");

  const cfgDir = '/root/.config/ngrok';
  const cfgPath = path.join(cfgDir, 'ngrok.yml');

  try {
    fs.mkdirSync(cfgDir, { recursive: true });
    if (!fs.existsSync(cfgPath)) {
      const contents = `version: "2"\nauthtoken: ${token}\n`;
      fs.writeFileSync(cfgPath, contents, { encoding: 'utf8' });
    }
    process.env.NGROK_CONFIG = cfgPath;
    process.env.NGROK_AUTHTOKEN = token;
    process.env.NGROK_AUTH_TOKEN = token;
    return cfgPath;
  } catch (e) {
    console.error('Failed to ensure ngrok config:', e);
    throw e;
  }
}

/*
 * setup
 */
const agentId = uuidv4();
const agentPort: number = Number(process.env.AGENT_PORT) || 5006; // ngrok port
function deriveAgentLabel() {
  const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
  const agentType = referenceAgent === "acapy" ? "ACA-Py" : "Credo";
  return `Ayra CTS Reference ${agentType} Agent`;
}

const agentLabel = deriveAgentLabel();
let activeNgrokListener: ngrok.Listener | null = null;
let acapyAdapter: AcaPyAgentAdapter | null = null;
let acapyIssuerAdapter: AcaPyAgentAdapter | null = null;
let acapyVerifierAdapter: AcaPyAgentAdapter | null = null;
const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
const issuerOverrideAgent = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
console.log(`[CONFIG] Reference agent: ${referenceAgent}`);
console.log(`[CONFIG] Issuer override agent: ${issuerOverrideAgent}`);

const resolveEffectiveIssuerAgent = (): "acapy" | "credo" => {
  const ref = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
  const override = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
  const effective = override === "auto" ? ref : override;
  if (effective !== "acapy" && effective !== "credo") {
    throw new Error(
      `Unsupported REFERENCE_ISSUER_OVERRIDE_AGENT=${override}. Expected 'auto', 'credo', or 'acapy'.`
    );
  }
  return effective;
};

const resolveReferenceAgentDomain = (): string | null =>
  process.env.REFERENCE_AGENT_NGROK_DOMAIN ??
  process.env.ISSUER_NGROK_DOMAIN ??
  process.env.VERIFIER_NGROK_DOMAIN ??
  process.env.SERVER_NGROK_DOMAIN ??
  process.env.NGROK_DOMAIN ??
  null;

const resolveOverrideAgentDomain = (): string | null =>
  process.env.ISSUER_OVERRIDE_NGROK_DOMAIN ??
  process.env.CREDO_ISSUER_NGROK_DOMAIN ??
  process.env.ISSUER_NGROK_DOMAIN ??
  null;

const init = async () => {
  if (referenceAgent === "acapy") {
    const issuerOverride = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
    const verifierOverride = normalizeEnvChoice(process.env.REFERENCE_VERIFIER_OVERRIDE_AGENT, "auto");
    const needsCredo =
      issuerOverride === "credo" ||
      verifierOverride === "credo";

    // Only start Credo when explicitly requested for mixed-mode runs.
    if (needsCredo) {
      try {
        await initCredoAgent();
      } catch (e) {
        console.warn(
          `[Credo] Agent init failed; continuing in ACA-Py-only mode: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    await initAcaPyController();
    await initAcaPyIssuerController();
  } else {
    await initCredoAgent();
  }
  await configureIssuerController();
  // Default card format (can be overridden via /api/card-format).
  if (!serverState.credentialFormat) {
    const effectiveIssuer = resolveEffectiveIssuerAgent();
    setCredentialFormat(effectiveIssuer === "acapy" ? "w3c" : "anoncreds");
  }
};

let acapyVerifierInitPromise: Promise<void> | null = null;
export const ensureAcaPyVerifierControllerInitialized = async (): Promise<void> => {
  if (serverState.verifierController) return;
  const baseUrl = normalizeEnvValue(process.env.ACAPY_VERIFIER_CONTROL_URL);
  if (!baseUrl) return;
  if (acapyVerifierInitPromise) return acapyVerifierInitPromise;
  acapyVerifierInitPromise = (async () => {
    await initAcaPyVerifierController();
  })()
    .catch((e) => {
      // Allow retries if the demo verifier comes up later.
      acapyVerifierInitPromise = null;
      throw e;
    });
  return acapyVerifierInitPromise;
};

const initCredoAgent = async () => {
  if (process.env.USE_NGROK === "true") {
    if (!process.env.NGROK_AUTH_TOKEN) {
      throw new Error("NGROK_AUTH_TOKEN not defined");
    }

    try {
      console.log("Cleaning up existing ngrok tunnels...");
      // Disconnect any tunnels this process previously opened
      await ngrok.disconnect();
      // Best-effort kill of any ngrok daemon spawned in prior runs
      await ngrok.kill();

      // Extra cleanup: terminate any leftover ngrok daemons if pkill exists
      const { execSync } = await import("child_process");
      try {
        execSync('sh -lc "command -v pkill >/dev/null 2>&1 && pkill -f ngrok || true"');
        console.log("Any existing ngrok processes terminated (if present).");
      } catch (e) {
        console.warn("pkill not available; skipping explicit ngrok process kill.");
      }
    } catch (cleanupErr) {
      console.warn("Ngrok cleanup warning:", cleanupErr);
    }

    const cfgPath = ensureNgrokConfig();
    console.log("Using NGROK_CONFIG:", cfgPath);
    console.log("connecting to ngrok...");

    let listener: ngrok.Listener | null = null;
    const poolingEnabled = (process.env.NGROK_POOLING_ENABLED ?? 'true').toLowerCase() === 'true';
    const referenceDomain = resolveReferenceAgentDomain();
    const overrideDomain = resolveOverrideAgentDomain();
    let ngrokDomain: string | null = referenceDomain;
    // If reference and issuer are split, pick the appropriate domain.
    // Avoid colliding with the ACA-Py sidecar when both reference and issuer are ACA-Py:
    // in that case, prefer the issuer override domain for this app tunnel.
    if (referenceAgent !== "credo" && issuerOverrideAgent === "credo") {
      ngrokDomain = overrideDomain || referenceDomain;
    } else if (referenceAgent === "acapy" && issuerOverrideAgent === "acapy") {
      ngrokDomain = overrideDomain || referenceDomain;
    }
    try {
      const config: NgrokConfig & { pooling_enabled?: boolean } = {
        addr: agentPort,
        proto: 'http',
        authtoken: process.env.NGROK_AUTH_TOKEN,
        region: process.env.NGROK_REGION || 'us',
      };
      if (poolingEnabled) {
        config.pooling_enabled = true;
      }
      if (ngrokDomain) {
        config.domain = ngrokDomain;
        console.log(`Requesting ngrok domain: ${ngrokDomain}`);
      }
      listener = await ngrok.connect(config);
    } catch (err) {
      console.error('Failed to establish ngrok tunnel', err);
      throw err;
    }

    const ngrokUrl = listener?.url();
    if (!ngrokUrl) {
      throw new Error('ngrok tunnel did not return a public url');
    }

    console.log(`ngrok tunnel established at ${ngrokUrl}`);
    activeNgrokListener = listener;
    const config = createAgentConfig(
      agentLabel,
      agentPort,
      agentId,
      ngrokUrl,
      [ngrokUrl]
    );
    setConfig(config);
    if (!config) {
      throw new Error("config not defined");
    }
    const agent = new BaseAgent(config);
    console.log("creating agent");
    await agent.init();
    console.log("setting agent");
    setAgent(agent);
    const controller = new AgentController(new CredoAgentAdapter(agent));
    setController(controller);
    setCredoController(controller);
    console.log("set agent and config");
  } else {
    const baseUrl = process.env.API_URL
      ? process.env.API_URL
      : "http://localhost:5005";
    if (!baseUrl) {
      throw new Error("BASE_URL not defined");
    }
    console.log("base url", baseUrl);
    const didcommEndpoint = (() => {
      const explicit = normalizeEnvValue(process.env.REFERENCE_AGENT_OOB_SERVICE_ENDPOINT);
      if (explicit) return explicit;
      try {
        const u = new URL(baseUrl);
        // Credo inbound transport listens on agentPort; advertise that to wallets/agents.
        u.port = String(agentPort);
        return u.toString().replace(/\/$/, "");
      } catch {
        return `http://localhost:${agentPort}`;
      }
    })();

    const config = createAgentConfig(agentLabel, agentPort, agentId, baseUrl, [
      didcommEndpoint,
    ]);
    setConfig(config);
    if (!config) {
      throw new Error("config not defined");
    }
    const agent = new BaseAgent(config);
    await agent.init();
    setAgent(agent);
    const controller = new AgentController(new CredoAgentAdapter(agent));
    setController(controller);
    setCredoController(controller);
  }
};

const initAcaPyController = async () => {
  const baseUrl =
    process.env.ACAPY_HOLDER_CONTROL_URL ||
    process.env.ACAPY_CONTROL_URL ||
    "http://localhost:9001";
  const profile = normalizeProfile(
    process.env.ACAPY_HOLDER_PROFILE || process.env.ACAPY_PROFILE,
    "holder"
  );
  console.log(`[ACAPY] Connecting to control service at ${baseUrl} (profile: ${profile})`);
  acapyAdapter = await AcaPyAgentAdapter.create({ baseUrl, profile });
  const controller = new AgentController(acapyAdapter);
  setController(controller);
  console.log("[ACAPY] Controller initialized");
};

const initAcaPyIssuerController = async () => {
  const baseUrl = process.env.ACAPY_CONTROL_URL || "http://localhost:9001";
  const profile = normalizeProfile(process.env.ACAPY_PROFILE, "issuer");
  console.log(`[ACAPY] Connecting to issuer control service at ${baseUrl} (profile: ${profile})`);
  acapyIssuerAdapter = await AcaPyAgentAdapter.create({ baseUrl, profile });
  const controller = new AgentController(acapyIssuerAdapter);
  setIssuerController(controller);
  setIssuerAgentType("acapy");
  console.log("[ACAPY] Issuer controller initialized");
};

const initAcaPyVerifierController = async () => {
  const baseUrl = process.env.ACAPY_VERIFIER_CONTROL_URL;
  if (!baseUrl) return;
  const profile = normalizeProfile(process.env.ACAPY_VERIFIER_PROFILE, "verifier");
  console.log(`[ACAPY] Connecting to verifier control service at ${baseUrl} (profile: ${profile})`);
  try {
    acapyVerifierAdapter = await AcaPyAgentAdapter.create({ baseUrl, profile });
    const controller = new AgentController(acapyVerifierAdapter);
    setVerifierController(controller);
    console.log("[ACAPY] Verifier controller initialized");
  } catch (e) {
    console.warn(
      `[ACAPY] Verifier controller init failed (is the service running?): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    // Optional: verifier controller is only needed for demo auto-send in verifier flow.
    setVerifierController(undefined);
  }
};

const shutdown = async () => {
  try {
    if (referenceAgent === "acapy" && acapyAdapter) {
      await acapyAdapter.shutdown();
    }
    if (referenceAgent === "acapy" && acapyIssuerAdapter) {
      await acapyIssuerAdapter.shutdown();
    }
    if (referenceAgent === "acapy" && acapyVerifierAdapter) {
      await acapyVerifierAdapter.shutdown();
    }
    if (activeNgrokListener) {
      await activeNgrokListener.close();
      activeNgrokListener = null;
    }
    await ngrok.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    await ngrok.kill();
  } catch {}
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const configureIssuerController = async () => {
  const override = normalizeEnvChoice(process.env.REFERENCE_ISSUER_OVERRIDE_AGENT, "auto");
  const effective = resolveEffectiveIssuerAgent();
  setIssuerAgentType(effective);
  process.env.ISSUER_EFFECTIVE_AGENT = effective;

  if (override === "auto") {
    console.log(`[Issuer Override] auto -> ${effective} (follows REFERENCE_AGENT)`);
  }

  if (effective === "acapy") {
    if (acapyIssuerAdapter) {
      const issuerController = new AgentController(acapyIssuerAdapter);
      setIssuerController(issuerController);
      if (override === "acapy") {
        console.log("[Issuer Override] Issuer controller set to ACA-Py (dedicated issuer adapter)");
      }
      return;
    }
    if (!acapyAdapter) {
      await initAcaPyController();
    }
    if (!acapyAdapter) {
      throw new Error("[Issuer Override] ACA-Py adapter not initialized");
    }
    const issuerController = new AgentController(acapyAdapter);
    setIssuerController(issuerController);
    if (override === "acapy") {
      console.log("[Issuer Override] Issuer controller set to ACA-Py (shared adapter)");
    }
    return;
  }

  // Credo issuer uses the shared Credo agent controller (`state.controller`), unless an explicit override is requested.
  if (effective === "credo") {
    if (override === "credo") {
      if (!serverState.agent) {
        throw new Error(
          "[Issuer Override] Credo agent not initialized; cannot create issuer controller"
        );
      }
      const overrideController = new AgentController(new CredoAgentAdapter(serverState.agent));
      setIssuerController(overrideController);
      console.log("[Issuer Override] Issuer controller set to Credo agent");
      return;
    }
    setIssuerController(undefined);
    return;
  }
};

export const reset = async () => {};
/**
 * Main function to set up and run the task pipeline.
 */
export const run = async (params?: any) => {
  await ensureInitialized();
  try {
    console.log("[RUN] Starting pipeline execution with params:", params);
    const verifyTrqpRequested = Boolean(params?.verifyTRQP);
    const { setVerifyTRQP } = await import("./state");
    setVerifyTRQP(verifyTrqpRequested);
    if (verifyTrqpRequested) {
      const mode = normalizeTrqpMode(params?.trqpMode);
      if (!mode) {
        throw new Error(
          "TRQP mode is required when verifyTRQP=true. Provide trqpMode=authorization|recognition|both."
        );
      }
      setTrqpMode(mode);
      const policyProfile = normalizeTrqpPolicyProfile(params?.trqpPolicyProfile);
      setTrqpPolicyProfile(policyProfile);
    } else {
      setTrqpMode(undefined);
      setTrqpPolicyProfile(undefined);
    }
    if (params?.pipelineType) {
      const pipelineType = params.pipelineType as PipelineType;
      console.log("[RUN] Pipeline override requested:", pipelineType);
      if (Object.values(PipelineType).includes(pipelineType)) {
        const referenceAgent = normalizeEnvChoice(process.env.REFERENCE_AGENT, "credo");
        const verifierAutoSend =
          normalizeEnvChoice(process.env.ACAPY_VERIFIER_AUTO_SEND_PROOF_REQUEST, "false") === "true";
        const verifierOverride = normalizeEnvChoice(process.env.REFERENCE_VERIFIER_OVERRIDE_AGENT, "auto");
        const effectiveVerifierOverride =
          verifierOverride === "auto" ? referenceAgent : verifierOverride;
        const needsDemoVerifierController =
          referenceAgent === "acapy" &&
          pipelineType === PipelineType.VERIFIER_TEST &&
          verifierAutoSend;
        if (needsDemoVerifierController) {
          try {
            await ensureAcaPyVerifierControllerInitialized();
          } catch (e) {
            console.warn(
              `[RUN] Demo verifier controller not available; continuing without it: ${
                e instanceof Error ? e.message : String(e)
              }`
            );
          }
        }
        try {
          selectPipeline(pipelineType);
        } catch (error) {
          console.error("[RUN] Failed to select requested pipeline:", error);
          throw error;
        }
      } else {
        console.warn("[RUN] Ignoring unknown pipeline override:", params.pipelineType);
      }
    }
    const pipeline = state.pipeline;
    if (!pipeline) {
      throw new Error("pipeline doesn't exist");
    }
    console.log("[RUN] Using pipeline:", pipeline.constructor?.name);

    // If we have an OOB URL and this is a VerifierTestPipeline, update it
    if (params?.oobUrl) {
      if ("setOobUrls" in pipeline && typeof (pipeline as any).setOobUrls === "function") {
        console.log("[RUN] Updating VerifierTestPipeline with OOB URLs:", {
          primary: params.oobUrl,
          secondary: params.oobUrlSecondary ?? null,
        });
        (pipeline as any).setOobUrls(params.oobUrl, params.oobUrlSecondary);
      } else if ("setOobUrl" in pipeline && typeof (pipeline as any).setOobUrl === "function") {
        console.log("[RUN] Updating VerifierTestPipeline with OOB URL:", params.oobUrl);
        (pipeline as any).setOobUrl(params.oobUrl);
      }
    }

    await pipeline.init();
    const dag = pipeline.dag();
    setDAG(dag);
    emitDAGUpdate();

    console.log("setup dag", dag);
    dag.onUpdate(() => {
      emitDAGUpdate();
    });

    // Start executing the DAG
    await dag.start();
    emitDAGUpdate();
  } catch (error) {
    console.error("An error occurred during pipeline execution:", error);
    // Don't exit the process - just log the error and allow the server to continue
    // This allows other tests to still run even if one fails
    emitDAGUpdate(); // Still emit update to show error state
  }
};

let initializationPromise: Promise<void> | null = null;
let initialized = false;

const ensureInitialized = async (): Promise<void> => {
  if (initialized) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    await init();
    try {
      selectPipeline(PipelineType.HOLDER_TEST);
    } catch (e) {
      console.error(e);
    }
    initialized = true;
  })().catch((error) => {
    initializationPromise = null;
    initialized = false;
    throw error;
  });

  return initializationPromise;
};

console.log("initializing");
ensureInitialized().catch((e) => {
  console.error("Failed to initialize CTS server", e);
});

runServer();

export { ensureInitialized };
