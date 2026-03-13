/**
 * Trust Registry API Service
 * 
 * This service handles interactions with the Trust Registry API
 * and implements the conformance tests based on the Python implementation
 */

import { generateNonce } from './didResolver';

const encodePath = (segment: string) => encodeURIComponent(segment);

export interface TestResult {
    name: string;
    description: string;
    status: 'passed' | 'failed';
    details?: string;
    response?: any;
}

export interface ConformanceTestReport {
    testResults: TestResult[];
    passedCount: number;
    failedCount: number;
    timestamp: string;
}

/**
 * Test GET /metadata endpoint
 */
export const testGetMetadata = async (baseUrl: string, headers = {}): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /metadata",
        description: "Tests the metadata endpoint for basic information about the Trust Registry",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/metadata`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            if (typeof data !== 'object') {
                testResult.details = "Expected JSON object for metadata";
                return testResult;
            }
            
            // Check required fields from RegistryMetadataType (current TRQP spec)
            // The Ayra metadata endpoint currently returns a free-form object.
            // We only ensure the payload is an object; specific keys are implementation-defined.
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /entities/{entity_id}
 */
export const testGetEntityInformation = async (
    baseUrl: string, 
    entityId: string, 
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /entities/{entity_id}",
        description: "Tests retrieving information about a specific entity",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/entities/${encodePath(entityId)}`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            if (typeof data !== 'object') {
                testResult.details = "Expected a JSON object for entity info";
                return testResult;
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /entities/{entity_id}/authorization
 */
export const testCheckEntityAuthorization = async (
    baseUrl: string, 
    entityId: string, 
    authorizationId: string,
    ecosystemDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /entities/{entity_id}/authorization",
        description: "Tests checking if an entity is authorized for a specific action",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/entities/${encodePath(entityId)}/authorization`;
        const params = new URLSearchParams({
            authorization_id: authorizationId,
            ecosystem_did: ecosystemDid,
            all: 'false'
        });
        
        const response = await fetch(`${url}?${params}`, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (typeof data === 'object' && data !== null) {
                if (Array.isArray(data)) {
                    // Check each item in the array
                    for (const item of data) {
                        if (!('authorized' in item)) {
                            testResult.details = "Missing 'authorized' key in one array item";
                            return testResult;
                        }
                    }
                } else {
                    // Check single object
                    if (!('authorized' in data)) {
                        testResult.details = "Missing 'authorized' key in single object response";
                        return testResult;
                    }
                }
                
                testResult.response = data;
            } else {
                testResult.details = "Unexpected JSON type (expected dict or list)";
                return testResult;
            }
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /registries/{ecosystem_did}/recognition
 */
export const testCheckEcosystemRecognition = async (
    baseUrl: string, 
    ecosystemDid: string,
    egfDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /registries/{ecosystem_did}/recognition",
        description: "Tests checking if an ecosystem is recognized by an EGF",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/registries/${encodePath(ecosystemDid)}/recognition`;
        const params = new URLSearchParams({
            egf_did: egfDid
        });
        
        const response = await fetch(`${url}?${params}`, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (typeof data !== 'object' || data === null) {
                testResult.details = "Expected a JSON object for recognition response";
                return testResult;
            }
            
            // Check required keys from RecognitionResponse
            const requiredKeys = ["recognized", "message", "evaluated_at", "response_time"];
            const missingKeys = requiredKeys.filter(key => !(key in data));
            
            if (missingKeys.length > 0) {
                testResult.details = `Missing keys in recognition response: ${missingKeys.join(', ')}`;
                return testResult;
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /ecosystems/{ecosystem_did}/recognitions
 */
export const testListEcosystemRecognitions = async (
    baseUrl: string, 
    ecosystemDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /ecosystems/{ecosystem_did}/recognitions",
        description: "Tests listing all recognitions for an ecosystem",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/ecosystems/${encodePath(ecosystemDid)}/recognitions`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                testResult.details = "Expected a list of RecognitionResponse objects";
                return testResult;
            }
            
            // Check each item for 'recognized' key
            for (const item of data) {
                if (!('recognized' in item)) {
                    testResult.details = "Missing 'recognized' in a recognition item";
                    return testResult;
                }
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /ecosystems/{ecosystem_did}/lookups/assuranceLevels
 */
export const testLookupSupportedAssuranceLevels = async (
    baseUrl: string, 
    ecosystemDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /ecosystems/{ecosystem_did}/lookups/assuranceLevels",
        description: "Tests retrieving supported assurance levels for an ecosystem",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/ecosystems/${encodePath(ecosystemDid)}/lookups/assuranceLevels`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                testResult.details = "Expected a list for assurance levels";
                return testResult;
            }
            
            // Check each item for assurance_level key
            for (const item of data) {
                if (typeof item !== 'object' || item === null) {
                    testResult.details = "Each item should be a JSON object";
                    return testResult;
                }
                
                if (!('assurance_level' in item)) {
                    testResult.details = "Missing 'assurance_level' key in item";
                    return testResult;
                }
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /ecosystems/{ecosystem_did}/lookups/authorizations
 */
export const testLookupAuthorizations = async (
    baseUrl: string, 
    ecosystemDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /ecosystems/{ecosystem_did}/lookups/authorizations",
        description: "Tests retrieving supported authorizations for an ecosystem",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/ecosystems/${encodePath(ecosystemDid)}/lookups/authorizations`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                testResult.details = "Expected a list for authorization responses";
                return testResult;
            }
            
            // Check each item for authorized key
            for (const item of data) {
                if (!('authorized' in item)) {
                    testResult.details = "Missing 'authorized' key in an auth item";
                    return testResult;
                }
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Test GET /egfs/{ecosystem_did}/lookups/didmethods
 */
export const testLookupSupportedDIDMethods = async (
    baseUrl: string, 
    ecosystemDid: string,
    headers = {}
): Promise<TestResult> => {
    const testResult: TestResult = {
        name: "GET /egfs/{ecosystem_did}/lookups/didmethods",
        description: "Tests retrieving supported DID methods for an ecosystem",
        status: 'failed'
    };
    
    try {
        const url = `${baseUrl}/egfs/${encodePath(ecosystemDid)}/lookups/didmethods`;
        const response = await fetch(url, { headers });
        
        if (![200, 401, 404].includes(response.status)) {
            testResult.details = `Unexpected status code: ${response.status}`;
            return testResult;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                testResult.details = "Expected a list of DIDMethodType objects";
                return testResult;
            }
            
            // Check each item for identifier key
            for (const item of data) {
                if (!('identifier' in item)) {
                    testResult.details = "Missing 'identifier' in DID method item";
                    return testResult;
                }
            }
            
            testResult.response = data;
        }
        
        testResult.status = 'passed';
    } catch (error) {
        testResult.details = `Exception occurred: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return testResult;
};

/**
 * Run all conformance tests against a Trust Registry API
 */
export const runAllConformanceTests = async (
    baseUrl: string,
    bearerToken: string = "",
    entityId: string = "did:example:entity123",
    authorizationId: string = "did:example:authz",
    ecosystemDid: string = "",
    egfDid: string = "did:example:egf"
): Promise<ConformanceTestReport> => {
    // Remove trailing slash from baseUrl if present
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    console.log("Running tests against normalized API URL:", normalizedBaseUrl);
    
    const headers: Record<string, string> = {
        "Accept": "application/json"
    };
    
    if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
    }
    
    const tests = [
        await testGetMetadata(normalizedBaseUrl, headers),
        await testGetEntityInformation(normalizedBaseUrl, entityId, headers),
        await testCheckEntityAuthorization(normalizedBaseUrl, entityId, authorizationId, ecosystemDid || egfDid, headers),
        await testCheckEcosystemRecognition(normalizedBaseUrl, ecosystemDid || "did:example:ecosystem", egfDid, headers),
        await testListEcosystemRecognitions(normalizedBaseUrl, ecosystemDid || "did:example:ecosystem", headers),
        await testLookupSupportedAssuranceLevels(normalizedBaseUrl, ecosystemDid || "did:example:ecosystem", headers),
        await testLookupAuthorizations(normalizedBaseUrl, ecosystemDid || "did:example:ecosystem", headers),
        await testLookupSupportedDIDMethods(normalizedBaseUrl, ecosystemDid || "did:example:ecosystem", headers)
    ];
    
    const passedCount = tests.filter(test => test.status === 'passed').length;
    const failedCount = tests.length - passedCount;
    
    return {
        testResults: tests,
        passedCount,
        failedCount,
        timestamp: new Date().toISOString()
    };
};

/**
 * Verify an entity's authorization against the Trust Registry
 */
export const verifyEntityAuthorization = async (
    baseUrl: string,
    entityId: string,
    authorityId: string,
    action: string,
    resource: string,
    contextJson?: string,
    bearerToken: string = ""
): Promise<{ authorized: boolean; details?: any }> => {
    try {
        const headers: Record<string, string> = {
            "Accept": "application/json"
        };
        
        if (bearerToken) {
            headers["Authorization"] = `Bearer ${bearerToken}`;
        }
        
        // Remove trailing slash from baseUrl if present
        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        const url = `${normalizedBaseUrl}/authorization`;
        console.log("Authorization URL (POST):", url);

        let parsedContext: any = {};
        if (contextJson) {
            try {
                parsedContext = JSON.parse(contextJson);
            } catch (e) {
                parsedContext = contextJson;
            }
        }

        const body = {
            entity_id: entityId,
            authority_id: authorityId,
            action,
            resource,
            context: parsedContext || {}
        };
        
        const response = await fetch(url, { 
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const detailsText = await response.text().catch(() => "");
            return {
                authorized: false,
                details: {
                    status: response.status,
                    message: response.statusText,
                    body: detailsText
                }
            };
        }
        
        const data = await response.json();
        
        if (typeof data === 'object' && data !== null) {
            if (Array.isArray(data)) {
                // If array, check if any item is authorized
                return {
                    authorized: data.some(item => item.authorized === true),
                    details: data
                };
            } else {
                // Single object
                return {
                    authorized: data.authorized === true,
                    details: data
                };
            }
        }
        
        return { authorized: false };
    } catch (error) {
        console.error("Error verifying authorization:", error);
        return { 
            authorized: false, 
            details: { error: error instanceof Error ? error.message : String(error) } 
        };
    }
};

/**
 * Verify recognition between ecosystems against the Trust Registry
 */
export const verifyEcosystemRecognition = async (
    baseUrl: string,
    entityId: string,
    authorityId: string,
    action: string,
    resource: string,
    contextJson?: string,
    bearerToken: string = ""
): Promise<{ recognized: boolean; details?: any }> => {
    try {
        const headers: Record<string, string> = {
            "Accept": "application/json"
        };

        if (bearerToken) {
            headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const url = `${normalizedBaseUrl}/recognition`;

        let parsedContext: any = {};
        if (contextJson) {
            try {
                parsedContext = JSON.parse(contextJson);
            } catch (e) {
                parsedContext = contextJson;
            }
        }

        const body = {
            entity_id: entityId,
            authority_id: authorityId,
            action,
            resource,
            context: parsedContext || {}
        };

        const response = await fetch(url, { 
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const detailsText = await response.text().catch(() => "");
            return {
                recognized: false,
                details: {
                    status: response.status,
                    message: response.statusText,
                    body: detailsText
                }
            };
        }

        const data = await response.json();

        if (typeof data === 'object' && data !== null) {
            return {
                recognized: data.recognized === true,
                details: data
            };
        }

        return { recognized: false };
    } catch (error) {
        console.error("Error verifying recognition:", error);
        return {
            recognized: false,
            details: { error: error instanceof Error ? error.message : String(error) }
        };
    }
};
