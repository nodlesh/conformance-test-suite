import fs from "fs";
import path from "path";

const normalizeEnvValue = (value?: string): string =>
  (value ?? "").split("#")[0].trim();

const parseIssuerDidFromEnv = (): string | null => {
  const raw = normalizeEnvValue(process.env.CTS_ISSUER_DID_OPTIONS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const did = typeof parsed?.did === "string" ? parsed.did.trim() : "";
    return did || null;
  } catch (error) {
    console.warn(
      "[DID] CTS_ISSUER_DID_OPTIONS is not valid JSON: " +
        (error instanceof Error ? error.message : String(error))
    );
    return null;
  }
};

const deriveDidWebPath = (did: string | null): string | null => {
  if (!did || !did.startsWith("did:web:")) return null;
  const parts = did.slice("did:web:".length).split(":");
  if (parts.length <= 1) return null;
  return parts.slice(1).join("/");
};

const resolvePublicRoot = (): string =>
  path.resolve(process.cwd(), "public");

export const resolveDidDocumentPath = (): string => {
  const override = normalizeEnvValue(process.env.CTS_DID_DOCUMENT_PATH);
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(process.cwd(), override);
  }
  const did = parseIssuerDidFromEnv();
  const webPath = deriveDidWebPath(did);
  const publicRoot = resolvePublicRoot();
  if (webPath) {
    return path.join(publicRoot, webPath, "did.json");
  }
  return path.join(publicRoot, ".well-known", "did.json");
};

export const resolveDidDocumentRoutes = (): string[] => {
  const did = parseIssuerDidFromEnv();
  const webPath = deriveDidWebPath(did);
  if (webPath) {
    const sanitized = webPath.replace(/^\/+/, "");
    return ["/" + sanitized + "/did.json"];
  }
  return ["/.well-known/did.json"];
};

export const loadDidDocument = (): unknown | null => {
  const docPath = resolveDidDocumentPath();
  try {
    const raw = fs.readFileSync(docPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(
      "[DID] DID document not available at " +
        docPath +
        ": " +
        (error instanceof Error ? error.message : String(error))
    );
    return null;
  }
};
