/**
 * DID Resolver Service
 * Handles DID resolution and verification of endpoints
 */

const DEFAULT_RESOLVER_URL = process.env.NEXT_PUBLIC_DID_RESOLVER_URL || "https://dev.uniresolver.io/1.0/identifiers";

export interface DIDDocument {
    id: string;
    service?: Array<{
        id: string;
        type: string;
        serviceEndpoint: string | {
            uri: string;
            [key: string]: any;
        } | any;
    }>;
    [key: string]: any;
}

/**
 * Resolves a DID to its DID Document
 * @param did The DID to resolve
 * @param resolverUrl The DID resolver URL
 * @returns The DID Document or null if resolution fails
 */
export const resolveDID = async (
    did: string,
    resolverUrl: string = DEFAULT_RESOLVER_URL
): Promise<DIDDocument | null> => {
    try {
        const endpoint = `${resolverUrl.replace(/\/$/, "")}/${did}`;
        const response = await fetch(endpoint);
        
        if (!response.ok) {
            throw new Error(`Failed to resolve DID: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.didDocument || null;
    } catch (error) {
        console.error(`Error resolving DID ${did}:`, error);
        return null;
    }
};

export const getDefaultResolverUrl = (): string => DEFAULT_RESOLVER_URL;

/**
 * Extracts a service endpoint from a DID Document
 * @param didDocument The DID Document
 * @param serviceType The type of service to find
 * @returns The service endpoint URL or null if not found
 */
export const getServiceEndpoint = (
    didDocument: DIDDocument | null,
    serviceType: string
): string | null => {
    if (!didDocument || !didDocument.service) {
        return null;
    }
    
    const service = didDocument.service.find(svc => svc.type === serviceType);
    if (!service || !service.serviceEndpoint) {
        return null;
    }
    
    // Handle both string and object serviceEndpoint formats
    if (typeof service.serviceEndpoint === 'string') {
        return service.serviceEndpoint;
    } else if (service.serviceEndpoint.uri) {
        return service.serviceEndpoint.uri;
    }
    
    return null;
};

/**
 * Checks if a DID Document has a TRQP service endpoint
 * @param didDocument The DID Document
 * @returns True if the document has a TRQP endpoint
 */
export const hasTRQPService = (didDocument: DIDDocument | null): boolean => {
    if (!didDocument || !didDocument.service) {
        return false;
    }
    
    return didDocument.service.some(svc => svc.type === "TRQP");
};

/**
 * Generate a random nonce (UUID v4)
 * @returns A UUID string
 */
export const generateNonce = (): string => {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
