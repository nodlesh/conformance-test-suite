/**
 * Service for creating and managing DIDComm connections.
 * Integrates with the agent service to use proper Out-of-Band invitations.
 */

import { EventEmitter } from "events";
import { createOutOfBandInvitation, getNgrokUrl, getBaseUrl } from "./agentService.server";

// Create an event emitter for connection events
export const connectionEventEmitter = new EventEmitter();

// Maximum time to wait for a connection in ms (default: 5 minutes)
const CONNECTION_TIMEOUT = Number(process.env.CONNECTION_TIMEOUT) || 300000;

/**
 * Creates a connection invitation using the agent service.
 * 
 * @param name The name of the inviter
 * @returns A connection invitation with ID, URL, and OOB invitation
 */
export const createInvitation = async (name: string): Promise<{ 
  id: string; 
  url: string;
  oobInvitation: any;
}> => {
    try {
        // Create the invitation using the agent service
        // We will specify a goal code for holder test
        const goalCode = 'aries.vc.holder.request';
        
        // Log the ngrok status
        const ngrokUrl = getNgrokUrl();
        if (!ngrokUrl && process.env.NODE_ENV !== 'development') {
            console.warn('Warning: No ngrok tunnel detected. The invitation will use localhost URLs,');
            console.warn('which will not be accessible from mobile devices unless they are on the same network.');
        }
        
        const { id, invitationUrl, outOfBandInvitation } = await createOutOfBandInvitation(name, goalCode);
        
        // Log details for debugging
        console.log(`Created invitation with ID: ${id}`);
        console.log(`Invitation URL: ${invitationUrl}`);
        console.log(`Service endpoint: ${outOfBandInvitation?.services?.[0]?.serviceEndpoint || 'Unknown'}`);
        
        return {
            id,
            url: invitationUrl,
            oobInvitation: outOfBandInvitation
        };
    } catch (error) {
        console.error('Error creating invitation:', error);
        throw error;
    }
};

/**
 * Begins waiting for a connection to be established.
 * This sets up listeners but does not block execution.
 * 
 * @param connectionId The ID of the connection to wait for
 * @returns A promise that resolves when the connection is established or rejects on timeout
 */
export const waitForConnection = (connectionId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        console.log(`Starting to wait for connection ${connectionId}`);
        
        // Set up listeners for the connection agent events
        const setupListeners = () => {
            // In a real implementation, this would listen for connection state changes
            // from the agent's event system
            
            // Set a timeout to reject if connection takes too long
            const timeoutId = setTimeout(() => {
                console.log(`Connection ${connectionId} timed out after ${CONNECTION_TIMEOUT}ms`);
                connectionEventEmitter.emit(`${connectionId}:timeout`);
                reject(new Error(`Connection timed out after ${CONNECTION_TIMEOUT}ms`));
            }, CONNECTION_TIMEOUT);
            
            // Listen for connection events from our mock system
            connectionEventEmitter.once(`${connectionId}:connected`, () => {
                clearTimeout(timeoutId);
                console.log(`Connection ${connectionId} established`);
                resolve(true);
            });
            
            // Listen for error events
            connectionEventEmitter.once(`${connectionId}:error`, (error) => {
                clearTimeout(timeoutId);
                console.error(`Connection ${connectionId} error:`, error);
                reject(error);
            });
            
            console.log(`Waiting for connection ${connectionId} - timeout set for ${CONNECTION_TIMEOUT}ms`);
        };
        
        setupListeners();
    });
};

/**
 * Simulates a successful connection for demo purposes.
 * 
 * @param connectionId The ID of the connection to simulate
 */
export const simulateConnection = (connectionId: string): void => {
    console.log(`Simulating successful connection for ${connectionId}`);
    connectionEventEmitter.emit(`${connectionId}:connected`);
};

/**
 * Simulates a failed connection for demo purposes.
 * 
 * @param connectionId The ID of the connection to simulate
 * @param errorMessage The error message for the failure
 */
export const simulateConnectionError = (connectionId: string, errorMessage: string): void => {
    console.log(`Simulating connection error for ${connectionId}: ${errorMessage}`);
    connectionEventEmitter.emit(`${connectionId}:error`, new Error(errorMessage));
};
