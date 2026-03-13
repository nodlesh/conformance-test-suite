/**
 * Verifier Test Context
 */

import { BaseTestContext } from "../BaseTestContext";

export interface VerifierContext extends BaseTestContext {
  // Connection
  connectionId?: string;
  connectionStatus?: string;
  
  // Presentation Request
  requestId?: string;
  requestType?: string;
  requestStatus?: string;
  
  // Verification
  presentationResult?: any;
  verificationStatus?: string;
  
  // Specific errors
  errors?: {
    connection: string | null;
    request: string | null;
    verification: string | null;
    [key: string]: string | null;
  };
}

export const createEmptyVerifierContext = (): VerifierContext => ({
  connectionId: "",
  connectionStatus: "",
  requestId: "",
  requestType: "",
  requestStatus: "",
  presentationResult: null,
  verificationStatus: "",
  reportTimestamp: "",
  errors: {
    connection: null,
    request: null,
    verification: null
  }
});
