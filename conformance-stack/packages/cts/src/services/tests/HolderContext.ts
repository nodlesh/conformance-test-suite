/**
 * Holder Test Context
 */

import { BaseTestContext } from "../BaseTestContext";

export interface HolderContext extends BaseTestContext {
  // Connection
  connectionId?: string;
  connectionStatus?: string;
  
  // Credential
  credentialId?: string;
  credentialType?: string;
  credentialStatus?: string;
  
  // Presentation
  presentationRequest?: any;
  presentationStatus?: string;
  presentationResult?: any;
  
  // Specific errors
  errors?: {
    connection: string | null;
    credential: string | null;
    presentation: string | null;
    [key: string]: string | null;
  };
}

export const createEmptyHolderContext = (): HolderContext => ({
  connectionId: "",
  connectionStatus: "",
  credentialId: "",
  credentialType: "",
  credentialStatus: "",
  presentationRequest: null,
  presentationStatus: "",
  presentationResult: null,
  reportTimestamp: "",
  errors: {
    connection: null,
    credential: null,
    presentation: null
  }
});
