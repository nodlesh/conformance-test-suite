/**
 * TestContext
 * 
 * This is a shared context that gets passed between test steps
 * to allow data from one step to be used in subsequent steps.
 */

import { DIDDocument } from "./didResolver";
import { ConformanceTestReport } from "./trustRegistryApi";

export interface TestContext {
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
    authorizationId?: string; // legacy Ayra extension
    action?: string;
    resource?: string;
    authContextJson?: string;
    authResult?: { authorized: boolean; details?: any } | null;

    // Recognition
    recognitionEntityId?: string;
    recognitionAuthorityId?: string;
    recognitionAction?: string;
    recognitionResource?: string;
    recognitionContextJson?: string;
    recognitionEcosystemId?: string; // legacy Ayra extension
    recognitionTargetId?: string; // legacy Ayra extension
    recognitionResult?: { recognized: boolean; details?: any } | null;
    
    // General
    reportTimestamp?: string;
    errors?: {
        didResolution?: string | null;
        apiTest?: string | null;
        authVerification?: string | null;
        recognitionVerification?: string | null;
    };
}

export type TestStepStatus = "pending" | "running" | "passed" | "failed" | "waiting" | "skipped";

export interface TestStepController {
    setStatus: (status: TestStepStatus) => void;
    setError: (error: string | null) => void;
    complete: (success: boolean) => void;
    updateContext: (updates: Partial<TestContext>) => void;
    goToNextStep: () => void;
}

/**
 * Create an empty test context
 */
export const createEmptyContext = (): TestContext => ({
    ecosystemDID: "",
    didDocument: null,
    resolverUrl: "",
    useKnownEndpoint: false,
    knownEndpointUrl: "",
    apiBaseUrl: "",
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
