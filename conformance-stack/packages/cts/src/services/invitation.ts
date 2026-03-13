import { Agent, ConnectionStateChangedEvent, ConnectionEventTypes, DidExchangeState, OutOfBandRecord } from "@credo-ts/core";

// Re-export functions from the connection service for backward compatibility
import { createInvitation as createConnectionInvitation, waitForConnection as waitForConnectionStatus } from "./connection";
import { createInvitationUrl } from "./urlUtils";

export interface ConnectionInvitation {
  outOfBandRecord: OutOfBandRecord;
  invitationUrl: string;
}

/**
 * Creates a new connection invitation using the provided agent.
 *
 * @param agent Instance of a configured and initialized agent.
 * @param domain Optional domain to use for the invitation URL.
 * @returns An object containing the out-of-band record and invitation URL.
 */
export const createInvitation = async (
  agent: Agent,
  domain?: string
): Promise<ConnectionInvitation> => {
  // Use the agent's OOB module to create an invitation
  const outOfBandRecord = await agent.oob.createInvitation();
  
  // Use environment variable if provided, otherwise use the passed domain or fallback
  const urlDomain = process.env.INVITATION_DOMAIN || domain || "localhost:3000";
  
  // Generate the URL using our utility function to ensure proper formatting
  const invitationUrl = createInvitationUrl(outOfBandRecord.outOfBandInvitation, urlDomain);
  
  console.log(`Created invitation with domain: ${urlDomain}`);
  console.log(`Invitation URL: ${invitationUrl}`);
  
  return { outOfBandRecord, invitationUrl };
};

/**
 * Waits for the connection associated with the provided out-of-band record to complete.
 *
 * @param agent Instance of the agent.
 * @param outOfBandRecord The out-of-band record to match against.
 * @returns A promise that resolves to true when the connection is established.
 */
export const waitForConnection = (
  agent: Agent,
  outOfBandRecord: OutOfBandRecord,
): Promise<boolean> => {
  return new Promise((resolve) => {
    // Set up an event listener for connection state changes
    const listener = (event: ConnectionStateChangedEvent) => {
      const { connectionRecord } = event.payload;
      // Only handle events for our invitation
      if (connectionRecord.outOfBandId !== outOfBandRecord.id) return;
      if (connectionRecord.state === DidExchangeState.Completed) {
        // Remove the listener once the connection is completed
        agent.events.off(ConnectionEventTypes.ConnectionStateChanged, listener);
        resolve(true);
      }
    };

    agent.events.on(ConnectionEventTypes.ConnectionStateChanged, listener);
  });
};

// For compatibility with code that may be using the older interface without an agent
export { createConnectionInvitation, waitForConnectionStatus };
