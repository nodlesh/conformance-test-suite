import fs from "fs";
import path from "path";

const normalizeEnvValue = (value?: string): string =>
  (value ?? "").split("#")[0].trim();

const adminUrl =
  normalizeEnvValue(process.env.ACAPY_ADMIN_URL) ||
  "http://acapy-control:8031";

const didMethod = normalizeEnvValue(process.env.CTS_ISSUER_DID_METHOD) || "web";
const didOptionsRaw = normalizeEnvValue(process.env.CTS_ISSUER_DID_OPTIONS);

const parseDidOptions = (): Record<string, unknown> => {
  if (!didOptionsRaw) return {};
  try {
    return JSON.parse(didOptionsRaw);
  } catch (error) {
    throw new Error(
      `CTS_ISSUER_DID_OPTIONS must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const didOptions = parseDidOptions();
const desiredDid = typeof didOptions.did === "string" ? didOptions.did.trim() : "";

if (didMethod === "web" && !desiredDid) {
  throw new Error("CTS_ISSUER_DID_OPTIONS must include a did:web DID for method=web");
}

const fetchJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }
  return response.json();
};

const createDid = async () => {
  const payload = {
    method: didMethod,
    options: {
      ...didOptions,
      key_type: didOptions.key_type || "ed25519",
    },
  };
  const data = await fetchJson(`${adminUrl}/wallet/did/create`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data?.result || data;
};

const listDids = async () => {
  const data = await fetchJson(`${adminUrl}/wallet/did`, { method: "GET" });
  const results = data?.results || data?.result || data?.records || [];
  return Array.isArray(results) ? results : [];
};

const deriveDidWebPath = (did: string): string | null => {
  if (!did.startsWith("did:web:")) return null;
  const parts = did.slice("did:web:".length).split(":");
  if (parts.length <= 1) return null;
  return parts.slice(1).join("/");
};

const resolveOutputPath = (did: string): string => {
  const override = normalizeEnvValue(process.env.CTS_DID_DOCUMENT_PATH);
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(process.cwd(), override);
  }
  const publicRoot = path.resolve(process.cwd(), "public");
  const webPath = deriveDidWebPath(did);
  if (webPath) {
    return path.join(publicRoot, webPath, "did.json");
  }
  return path.join(publicRoot, ".well-known", "did.json");
};

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const base58Decode = (input: string): Uint8Array => {
  if (!input) return new Uint8Array();
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
};

const base58Encode = (bytes: Uint8Array): string => {
  if (!bytes.length) return "";
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeros += 1;
  }
  const prefix = "1".repeat(leadingZeros);
  return prefix + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
};

const toEd25519Multibase = (verkey: string): string => {
  const rawKey = base58Decode(verkey);
  const multicodecPrefix = new Uint8Array([0xed, 0x01]);
  const multikey = new Uint8Array(multicodecPrefix.length + rawKey.length);
  multikey.set(multicodecPrefix, 0);
  multikey.set(rawKey, multicodecPrefix.length);
  return `z${base58Encode(multikey)}`;
};

const main = async () => {
  let info: any | null = null;
  try {
    info = await createDid();
  } catch (error) {
    console.warn(
      `[DID] create failed; trying lookup instead: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const did = info?.did || desiredDid;
  const verkey = info?.verkey;
  let resolvedInfo = info;

  if (!verkey) {
    const list = await listDids();
    resolvedInfo = list.find((record) => record?.did === did) || null;
  }

  if (!resolvedInfo?.did || !resolvedInfo?.verkey) {
    throw new Error(
      `Unable to resolve DID+verkey for ${did || "unknown"} via ${adminUrl}`
    );
  }

  const fragment = resolvedInfo.did.split(":").pop();
  const keyId = fragment
    ? `${resolvedInfo.did}#${fragment}`
    : `${resolvedInfo.did}#key-1`;
  const doc = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: resolvedInfo.did,
    verificationMethod: [
      {
        id: keyId,
        type: "Ed25519VerificationKey2020",
        controller: resolvedInfo.did,
        publicKeyMultibase: toEd25519Multibase(resolvedInfo.verkey),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
  };

  const outputPath = resolveOutputPath(resolvedInfo.did);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2) + "\n", "utf8");

  const webPath = deriveDidWebPath(resolvedInfo.did);
  const routeHint = webPath
    ? `/${webPath}/did.json`
    : "/.well-known/did.json";

  console.log(`[DID] Wrote ${outputPath}`);
  console.log(`[DID] DID: ${resolvedInfo.did}`);
  console.log(`[DID] Host route: ${routeHint}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
