/**
 * Issuer Test Context
 */

import { BaseTestContext } from "../BaseTestContext";

export interface IssuerContext extends BaseTestContext {
  // Connection
  connectionId?: string;
  connectionStatus?: string;
  
  // Credential
  credentialId?: string;
  credentialType?: string;
  credentialStatus?: string;
  credentialDefinitionId?: string;
  
  // Credential Issuance
  issuanceRequest?: any;
  issuanceStatus?: string;
  issuanceResult?: any;
  
  // Specific errors
  errors: {
    connection: string | null;
    credential: string | null;
    issuance: string | null;
    [key: string]: string | null;
  };
}

export const createEmptyIssuerContext = (): IssuerContext => ({
  connectionId: "",
  connectionStatus: "",
  credentialId: "",
  credentialType: "",
  credentialStatus: "",
  credentialDefinitionId: "",
  issuanceRequest: null,
  issuanceStatus: "",
  issuanceResult: null,
  reportTimestamp: "",
  errors: {
    connection: null,
    credential: null,
    issuance: null
  }
}); 