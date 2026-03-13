import fs from "fs";
import path from "path";
import fetch from "node-fetch";

type CreateDidResult = {
  result: {
    did: string;
  };
};

type IssueResponse = {
  verifiableCredential: unknown;
};

type VerifyResponse = {
  verified: boolean;
  document?: unknown;
};

const adminUrl = process.env.ACAPY_ADMIN_URL ?? "http://localhost:8031";

const contextPath =
  process.env.AYRA_CONTEXT_PATH ??
  path.resolve(process.cwd(), "schema", "AyraBusinessCardV1R0.jsonld");

const subjectDid =
  process.env.AYRA_SUBJECT_DID ??
  "did:key:z6MkhjQjDuoQk7G8hkpuySqQMzuyjaAhmMS6G6Lk2mSuk4zB";

async function createDid(): Promise<string> {
  const res = await fetch(`${adminUrl}/wallet/did/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "key", options: { key_type: "ed25519" } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create DID: ${res.status} ${text}`);
  }
  const data = (await res.json()) as CreateDidResult;
  return data.result.did;
}

function loadLocalContext(): any {
  if (!fs.existsSync(contextPath)) {
    throw new Error(`Context file not found at ${contextPath}`);
  }
  const raw = fs.readFileSync(contextPath, "utf8");
  return JSON.parse(raw)["@context"] ?? JSON.parse(raw);
}

function buildCredential(issuerDid: string) {
  const inlineContext = loadLocalContext();
  const normalizeEnvValue = (value?: string): string =>
    (value ?? "").split("#")[0].trim();
  const trustNetworkDid =
    normalizeEnvValue(process.env.AYRA_TRUST_NETWORK_DID) || "did:web:ayra.forum";
  const ecosystemId =
    normalizeEnvValue(process.env.AYRA_ECOSYSTEM_DID) || "did:web:ecosystem.example";
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      inlineContext,
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    type: ["VerifiableCredential", "AyraBusinessCard"],
    issuer: { id: issuerDid },
    validFrom: "2025-01-01T00:00:00Z",
    validUntil: "2026-01-01T00:00:00Z",
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

async function issueVc(payload: any): Promise<IssueResponse> {
  const res = await fetch(`${adminUrl}/vc/credentials/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Issue failed: ${res.status} ${text}`);
  }
  return (await res.json()) as IssueResponse;
}

async function verifyVc(vc: unknown): Promise<VerifyResponse> {
  const res = await fetch(`${adminUrl}/vc/credentials/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifiableCredential: vc }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Verify failed: ${res.status} ${text}`);
  }
  return (await res.json()) as VerifyResponse;
}

async function main() {
  const issuerDid = await createDid();
  const fragment = issuerDid.split(":").pop();
  if (!fragment) throw new Error(`Could not derive verification fragment from ${issuerDid}`);
  const credential = buildCredential(issuerDid);
  const issuePayload = {
    credential,
    options: {
      proofType: "Ed25519Signature2020",
      verificationMethod: `${issuerDid}#${fragment}`,
      proofPurpose: "assertionMethod",
    },
  };

  console.log("Issuing Ayra Business Card LDP VC via VC-API...");
  const issued = await issueVc(issuePayload);
  console.log("Issued VC");

  console.log("Verifying issued VC...");
  const verify = await verifyVc((issued as any).verifiableCredential);
  console.log("Verify result:", verify.verified ? "verified" : "not verified");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
