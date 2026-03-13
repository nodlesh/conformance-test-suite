type TrqpMode = "authorization" | "recognition" | "both";

type TrqpBindingSuggestion = {
  action: string;
  resource: string;
  capability?: string;
};

type TrqpSuggestInput = {
  ecosystemDid?: string;
  trustNetworkDid?: string;
  cardType?: string;
};

type TrqpSuggestResult = {
  mode: TrqpMode;
  authorization: TrqpBindingSuggestion;
  recognition: TrqpBindingSuggestion;
  source: {
    ecosystemDid: string;
    trustNetworkDid: string;
    trqpEndpoint: string;
    endpointSource: "configured" | "did-resolution";
    suggestedAt: string;
  };
  warnings: string[];
};

const normalizeEnvValue = (value?: string): string => (value ?? "").split("#")[0].trim();

const isTruthy = (value?: string): boolean => normalizeEnvValue(value).toLowerCase() === "true";

const configuredTrqpEndpoint = (): string =>
  normalizeEnvValue(process.env.NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT) ||
  normalizeEnvValue(process.env.NEXT_PUBLIC_TRQP_LOCAL_URL);

const defaultResolverUrl = "https://dev.uniresolver.io/1.0/identifiers";

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const raw = await resp.text().catch(() => "");
    const ngrokCode = resp.headers.get("ngrok-error-code");
    let detail = "";
    if (ngrokCode) {
      detail = `ngrok endpoint offline (${ngrokCode})`;
    } else {
      const stripped = raw
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      detail = stripped.slice(0, 180);
    }
    throw new Error(`${resp.status} ${resp.statusText}${detail ? `: ${detail}` : ""}`.trim());
  }
  return resp.json();
}

function isHttpNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /^\s*404\b/.test(error.message);
}

async function resolveDidDocument(did: string): Promise<any> {
  const resolverUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_DID_RESOLVER_URL) || defaultResolverUrl;
  const endpoint = `${resolverUrl.replace(/\/$/, "")}/${did}`;
  const data = await fetchJson(endpoint);
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

async function resolveTrqpEndpoint(
  ecosystemDid: string
): Promise<{ endpoint: string; source: "configured" | "did-resolution" }> {
  const configured = configuredTrqpEndpoint();
  if (configured) {
    return { endpoint: configured.replace(/\/$/, ""), source: "configured" };
  }

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
  return { endpoint: endpoint.replace(/\/$/, ""), source: "did-resolution" };
}

function coerceArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

function parseActionResourcePair(value: string): { action: string; resource: string } | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const dashIdx = normalized.indexOf(" - ");
  if (dashIdx > 0) {
    const action = normalized.slice(0, dashIdx).trim();
    const resource = normalized.slice(dashIdx + 3).trim();
    if (action && resource) return { action, resource };
  }
  const colonIdx = normalized.indexOf(":");
  if (colonIdx > 0) {
    const action = normalized.slice(0, colonIdx).trim();
    const resource = normalized.slice(colonIdx + 1).trim();
    if (action && resource) return { action, resource };
  }
  return null;
}

function parseAuthorizationCandidates(payload: any): TrqpBindingSuggestion[] {
  const list = coerceArray(payload);
  const out: TrqpBindingSuggestion[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const parsed = parseActionResourcePair(item);
      if (parsed) out.push({ action: parsed.action, resource: parsed.resource });
      continue;
    }
    const action = normalizeEnvValue(item?.action || item?.name || "");
    const resource = normalizeEnvValue(item?.resource || item?.type || "");
    if (action && resource) {
      out.push({ action, resource });
    }
  }
  return out;
}

function pickAuthorizationCandidate(
  candidates: TrqpBindingSuggestion[],
  fallback: TrqpBindingSuggestion
): TrqpBindingSuggestion {
  if (candidates.length === 0) return fallback;
  const preferred = candidates.find(
    (item) => item.action.toLowerCase() === "issue" && item.resource.toLowerCase().includes("ayracard")
  );
  return preferred || candidates[0];
}

function parseRecognitionCandidates(payload: any): Array<TrqpBindingSuggestion & { authorityId?: string }> {
  const list = coerceArray(payload);
  const out: Array<TrqpBindingSuggestion & { authorityId?: string }> = [];
  for (const item of list) {
    const action = normalizeEnvValue(item?.action || item?.recognition_action || "");
    const resource = normalizeEnvValue(item?.resource || item?.recognition_resource || "");
    const capability = normalizeEnvValue(
      item?.capability || item?.scope || item?.context?.capability || item?.metadata?.capability || ""
    );
    const authorityId = normalizeEnvValue(
      item?.authority_id || item?.recognized_registry_did || item?.registry_did || item?.target_did || ""
    );
    if (action && resource) {
      const candidate: TrqpBindingSuggestion & { authorityId?: string } = { action, resource };
      if (capability) candidate.capability = capability;
      if (authorityId) candidate.authorityId = authorityId;
      out.push(candidate);
    }
  }
  return out;
}

function pickRecognitionCandidate(
  candidates: Array<TrqpBindingSuggestion & { authorityId?: string }>,
  trustNetworkDid: string,
  fallback: TrqpBindingSuggestion
): TrqpBindingSuggestion {
  if (candidates.length === 0) return fallback;
  const scoped = trustNetworkDid
    ? candidates.filter((item) => item.authorityId && item.authorityId === trustNetworkDid)
    : candidates;
  const pool = scoped.length > 0 ? scoped : candidates;
  const preferred = pool.find(
    (item) => item.action.toLowerCase() === "member-of" && item.resource.toLowerCase() === "ayratrustnetwork"
  );
  return preferred || pool[0];
}

export const isTrqpSuggestHelperEnabled = (): boolean =>
  isTruthy(process.env.NEXT_PUBLIC_TRQP_SUGGEST_FROM_TR_ENABLED) ||
  isTruthy(process.env.TRQP_SUGGEST_FROM_TR_ENABLED);

export async function buildTrqpPolicySuggestion(input: TrqpSuggestInput = {}): Promise<TrqpSuggestResult> {
  const warnings: string[] = [];
  const ecosystemDid = normalizeEnvValue(input.ecosystemDid) || normalizeEnvValue(process.env.AYRA_ECOSYSTEM_DID);
  const trustNetworkDid =
    normalizeEnvValue(input.trustNetworkDid) || normalizeEnvValue(process.env.AYRA_TRUST_NETWORK_DID);
  const cardType = normalizeEnvValue(input.cardType) || "businesscard";

  if (!ecosystemDid) {
    throw new Error("Ecosystem DID is required for TR suggestions. Set AYRA_ECOSYSTEM_DID or provide ecosystemDid.");
  }

  const defaultAuthorization: TrqpBindingSuggestion = {
    action: "issue",
    resource: `ayracard:${cardType}`,
  };
  const defaultRecognition: TrqpBindingSuggestion = {
    action: "member-of",
    resource: "ayratrustnetwork",
  };

  const { endpoint: trqpEndpoint, source } = await resolveTrqpEndpoint(ecosystemDid);

  let authSupported = false;
  let recognitionSupported = false;

  let authorization = defaultAuthorization;
  try {
    const lookupUrls = [
      `${trqpEndpoint}/lookups/authorizations?ecosystem_did=${encodeURIComponent(ecosystemDid)}`,
      `${trqpEndpoint}/ecosystems/${encodeURIComponent(ecosystemDid)}/lookups/authorizations`,
    ];
    let authPayload: any;
    let lastLookupError: unknown;
    for (const lookupUrl of lookupUrls) {
      try {
        authPayload = await fetchJson(lookupUrl);
        lastLookupError = undefined;
        break;
      } catch (error) {
        lastLookupError = error;
        if (!isHttpNotFound(error)) {
          throw error;
        }
      }
    }
    if (typeof authPayload === "undefined" && typeof lastLookupError !== "undefined") {
      throw lastLookupError;
    }
    const candidates = parseAuthorizationCandidates(authPayload);
    authorization = pickAuthorizationCandidate(candidates, defaultAuthorization);
    authSupported = true;
  } catch (error) {
    warnings.push(
      `Authorization lookup unavailable; using default (${defaultAuthorization.action} ${defaultAuthorization.resource}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  let recognition = defaultRecognition;
  try {
    const recPayload = await fetchJson(
      `${trqpEndpoint}/ecosystems/${encodeURIComponent(ecosystemDid)}/recognitions`
    );
    const candidates = parseRecognitionCandidates(recPayload);
    recognition = pickRecognitionCandidate(candidates, trustNetworkDid, defaultRecognition);
    recognitionSupported = true;
  } catch (error) {
    warnings.push(
      `Recognition lookup unavailable; using default (${defaultRecognition.action} ${defaultRecognition.resource}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const mode: TrqpMode = authSupported && recognitionSupported ? "both" : authSupported ? "authorization" : recognitionSupported ? "recognition" : "both";

  return {
    mode,
    authorization,
    recognition,
    source: {
      ecosystemDid,
      trustNetworkDid,
      trqpEndpoint,
      endpointSource: source,
      suggestedAt: new Date().toISOString(),
    },
    warnings,
  };
}
