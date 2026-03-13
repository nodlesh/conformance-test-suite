/**
 * Trust Registry Test Context
 */

import { BaseTestContext } from "../BaseTestContext";
import { DIDDocument, getDefaultResolverUrl } from "../didResolver";
import { ConformanceTestReport } from "../trustRegistryApi";

export interface TrustRegistryContext extends BaseTestContext {
  // DID Resolution
  ecosystemDID?: string;
  didDocument?: DIDDocument | null;
  resolverUrl?: string;
  useKnownEndpoint?: boolean;
  knownEndpointUrl?: string;
  
  // API Testing
  apiBaseUrl?: string;
  apiTestReport?: ConformanceTestReport | null;
  
  // Authorization
  entityId?: string;
  authorityId?: string;
  authorizationId?: string;
  action?: string;
  resource?: string;
  authContextJson?: string;
  authResult?: { authorized: boolean; details?: any } | null;
  recognitionEntityId?: string;
  recognitionAuthorityId?: string;
  recognitionAction?: string;
  recognitionResource?: string;
  recognitionContextJson?: string;
  recognitionEcosystemId?: string;
  recognitionTargetId?: string;
  recognitionResult?: { recognized: boolean; details?: any } | null;
  
  // Specific errors
  errors: {
    didResolution: string | null;
    apiTest: string | null;
    authVerification: string | null;
    recognitionVerification: string | null;
    [key: string]: string | null;
  };
}

const defaultResolverUrl = getDefaultResolverUrl();
const defaultKnownEndpoint = process.env.NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT || "";

export const createEmptyTrustRegistryContext = (): TrustRegistryContext => ({
  ecosystemDID: "",
  didDocument: null,
  resolverUrl: defaultResolverUrl,
  useKnownEndpoint: !!defaultKnownEndpoint,
  knownEndpointUrl: defaultKnownEndpoint,
  apiBaseUrl: defaultKnownEndpoint || "",
  apiTestReport: null,
  entityId: "",
  authorityId: "",
  authorizationId: "",
  action: "",
  resource: "",
  authContextJson: "",
  authResult: null,
  recognitionEntityId: "",
  recognitionAuthorityId: "",
  recognitionAction: "",
  recognitionResource: "",
  recognitionContextJson: "",
  recognitionEcosystemId: "",
  recognitionTargetId: "",
  recognitionResult: null,
  reportTimestamp: "",
  errors: {
    didResolution: null,
    apiTest: null,
    authVerification: null,
    recognitionVerification: null
  }
});
