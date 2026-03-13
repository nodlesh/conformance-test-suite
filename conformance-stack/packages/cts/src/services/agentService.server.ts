import { EventEmitter } from 'events';
import { formatDomain } from './urlUtils';
import { BaseAgent } from "@demo/core/agent/core";
import { createAgentConfig } from "@demo/core/agent/utils";
import {
    Agent,
    OutOfBandRecord,
    DidExchangeState,
    ConnectionRecord,
    ConnectionStateChangedEvent,
    ConnectionEventTypes,
} from "@credo-ts/core";
import { v4 as uuidv4 } from "uuid";

// Create an event emitter for agent events
export const agentEventEmitter = new EventEmitter();

// Configuration
const AGENT_PORT = Number(process.env.AGENT_PORT) || 3000;
const USE_NGROK = process.env.USE_NGROK === 'true';
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN;
// CRITICAL: Always default to port 3000 if not specified
const NGROK_PORT = Number(process.env.NGROK_PORT) || 3000;
const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Agent state
let ngrokUrl: string | null = null;
let baseUrl: string = DEFAULT_BASE_URL;
let currentInvitation: string | null = null;
let currentQrCode: string | null = null;
let agent: BaseAgent | null = null;

// Initialize once (singleton pattern)
let globalInitPromise: Promise<string> | null = null;

// Add connection state tracking
let isInitializing = false;
let isConnected = false;
let connectionPromise: Promise<string> | null = null;
let ngrokInstance: any = null;

/**
 * Alternative implementation that doesn't use ngrok and only works with local connections.
 * This is used as a fallback when ngrok is not working properly.
 * 
 * @returns A local URL for testing
 */
export const initializeLocalMode = async (): Promise<string> => {
  console.log('\n========== LOCAL MODE ACTIVATED ==========');
  console.log('WARNING: ngrok is not working properly.');
  console.log('Falling back to local mode - connections will only work on the same network.');
  console.log('This means mobile wallets MUST be on the same WiFi network as this server.');
  console.log('For testing, you can still use the simulation options.');
  console.log('============================================\n');
  
  // Reset the ngrok URL to ensure we don't use it
  console.log('Clearing ngrok URL in local mode');
  ngrokUrl = null;
  baseUrl = DEFAULT_BASE_URL;
  
  // Since we're using a singleton pattern, if we go to local mode
  // we need to keep track of that to prevent reinitialization
  globalInitPromise = Promise.resolve(formatDomain(DEFAULT_BASE_URL));
  
  return formatDomain(DEFAULT_BASE_URL);
};

/**
 * Creates an .env.local file with ngrok disabled
 * This is a helper function for users who encounter persistent ngrok issues
 */
async function createLocalOnlyConfig(): Promise<void> {
  try {
    // Only do this on server side
    console.log('Creating local-only configuration...');
    
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env.local');
    
    // Check if .env.local exists
    let content = '';
    try {
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
        
        // Replace USE_NGROK=true with USE_NGROK=false
        content = content.replace(/USE_NGROK\s*=\s*true/g, 'USE_NGROK=false');
        
        // If USE_NGROK is not in file, add it
        if (!content.includes('USE_NGROK=')) {
          content += '\nUSE_NGROK=false # Disabled due to persistent ngrok issues\n';
        }
      } else {
        // Create minimal .env.local file
        content = 'USE_NGROK=false # Disabled due to persistent ngrok issues\n';
      }
      
      // Save the modified content
      fs.writeFileSync(envPath, content, 'utf8');
      console.log('Updated .env.local to disable ngrok');
    } catch (err) {
      console.error('Error modifying .env.local:', err);
    }
  } catch (error) {
    console.error('Error creating local-only config:', error);
  }
}

// Dynamic import function for ngrok that only runs on server-side
async function importNgrok() {
  try {
    // Use dynamic import with a variable to prevent bundling
    const moduleName = '@ngrok/ngrok';
    return await import(/* webpackIgnore: true */ moduleName);
  } catch (error) {
    console.error('Error importing ngrok:', error);
    throw error;
  }
}

/**
 * Forces a disconnect of all ngrok sessions on the dashboard
 */
async function forceNgrokReset(): Promise<void> {
  try {
    console.log('Attempting to force reset all ngrok sessions...');
    
    if (!NGROK_AUTH_TOKEN) {
      console.log('No auth token available for ngrok reset');
      return;
    }
    
    try {
      const ngrok = await importNgrok();
      
      // Kill any existing ngrok processes
      try {
        await ngrok.disconnect();
        console.log('Successfully disconnected all active ngrok tunnels');
      } catch (error) {
        console.log('No active tunnels to disconnect or error disconnecting');
      }
      
      // Add a delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('Ngrok sessions should now be cleared');
    } catch (importError) {
      console.log('Could not import ngrok module', importError);
    }
  } catch (error) {
    console.error('Error during ngrok reset:', error);
  }
}

/**
 * Initializes the agent with optional ngrok tunneling.
 * @returns The base URL for the agent
 */
export const initializeAgent = async (): Promise<string> => {
  // If already connected, return the existing URL
  if (isConnected && ngrokUrl) {
    console.log('Using existing ngrok connection:', ngrokUrl);
    return formatDomain(ngrokUrl);
  }

  // If already initializing, return the existing promise
  if (isInitializing && connectionPromise) {
    console.log('Connection already in progress, waiting for result...');
    return connectionPromise;
  }

  // Start new initialization
  isInitializing = true;
  console.log('Starting new ngrok connection...');
  
  connectionPromise = _initializeAgentImpl()
    .then(url => {
      isConnected = true;
      isInitializing = false;
      return url;
    })
    .catch(error => {
      isInitializing = false;
      isConnected = false;
      ngrokInstance = null;
      throw error;
    });

  return connectionPromise;
};

/**
 * Implementation of agent initialization
 */
async function _initializeAgentImpl(): Promise<string> {
  try {
    if (USE_NGROK) {
      if (!NGROK_AUTH_TOKEN || NGROK_AUTH_TOKEN === 'your_ngrok_auth_token') {
        console.warn('NGROK_AUTH_TOKEN not defined or is set to the placeholder value');
        return initializeLocalMode();
      }

      // First, attempt to reset any existing ngrok sessions
      await forceNgrokReset();

      try {
        console.log("Connecting to ngrok...");
        
        // Import ngrok module
        const ngrok = await importNgrok();
        ngrokInstance = ngrok;
        
        if (!ngrok || typeof ngrok.forward !== 'function') {
          throw new Error('@ngrok/ngrok module is not properly initialized');
        }
        
        // Check if we already have an active connection
        if (ngrokUrl) {
          console.log(`Reusing existing ngrok tunnel: ${ngrokUrl}`);
          return formatDomain(ngrokUrl);
        }
        
        // Create a new tunnel
        const tunnel = await ngrok.forward({
          addr: NGROK_PORT,
          authtoken: NGROK_AUTH_TOKEN,
        });
        
        if (!tunnel || !tunnel.url) {
          throw new Error('Failed to create ngrok tunnel');
        }
        
        console.log(`Ngrok tunnel established: ${tunnel.url}`);
        ngrokUrl = tunnel.url;
        baseUrl = tunnel.url;
        
        return formatDomain(tunnel.url);
      } catch (error) {
        console.error('Error setting up ngrok:', error);
        return initializeLocalMode();
      }
    } else {
      console.log('Ngrok disabled, using local mode');
      return initializeLocalMode();
    }
  } catch (error) {
    console.error('Error in agent initialization:', error);
    return initializeLocalMode();
  }
}

/**
 * Sets up a connection listener for the agent
 */
export const setupConnectionListener = async (
    agent: Agent,
    outOfBandRecord: OutOfBandRecord,
    cb: (...args: any) => void,
): Promise<void> => {
    agent.events.on(ConnectionEventTypes.ConnectionStateChanged, async (event: ConnectionStateChangedEvent) => {
        if (event.payload.connectionRecord.outOfBandId === outOfBandRecord.id) {
            if (event.payload.connectionRecord.state === DidExchangeState.Completed) {
                cb(event.payload.connectionRecord);
            }
        }
    });
};

/**
 * Gets a connection record for a given out-of-band ID
 */
export const getConnectionRecord = (
    agent: Agent,
    outOfBandId: string,
): Promise<ConnectionRecord> =>
    new Promise<ConnectionRecord>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Connection record not found'));
        }, 10000);

        const listener = (event: ConnectionStateChangedEvent) => {
            if (event.payload.connectionRecord.outOfBandId === outOfBandId) {
                if (event.payload.connectionRecord.state === DidExchangeState.Completed) {
                    clearTimeout(timeout);
                    agent.events.off(ConnectionEventTypes.ConnectionStateChanged, listener);
                    resolve(event.payload.connectionRecord);
                }
            }
        };

        agent.events.on(ConnectionEventTypes.ConnectionStateChanged, listener);
    });

/**
 * Creates a mock invitation for testing
 */
export const createMockInvitation = (label: string, goalCode: string = 'aries.vc.verify'): {
  id: string;
  invitationUrl: string;
  outOfBandInvitation: any;
} => {
  const id = uuidv4();
  const invitationUrl = `http://localhost:3000/invitation/${id}`;
  const outOfBandInvitation = {
    id,
    label,
    goalCode,
    services: [
      {
        id: uuidv4(),
        type: 'did-communication',
        recipientKeys: ['did:key:z6MkqYHpJd2pz5g7qj8XrK3vL4mN5pQ6rS7tU8vW9xY0zA1B2C3D4E5F6G7H8I9J0'],
        routingKeys: [],
        serviceEndpoint: invitationUrl,
      },
    ],
  };

  return {
    id,
    invitationUrl,
    outOfBandInvitation,
  };
};

/**
 * Creates an out-of-band invitation
 */
export const createOutOfBandInvitation = async (
  label: string, 
  goalCode: string = 'aries.vc.verify'
): Promise<{
  id: string;
  invitationUrl: string;
  outOfBandInvitation: any;
}> => {
  if (!agent) {
    throw new Error('Agent not initialized');
  }

  const outOfBandRecord = await agent.agent.oob.createInvitation({
    label,
    goalCode,
    goal: 'To verify credentials',
    multiUseInvitation: true,
  });

  const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({ domain: baseUrl });
  currentInvitation = invitationUrl;

  return {
    id: outOfBandRecord.id,
    invitationUrl,
    outOfBandInvitation: outOfBandRecord.outOfBandInvitation,
  };
};

/**
 * Creates a holder invitation
 */
export const createHolderInvitation = async (label: string = 'Ayra Holder Test') => {
  return createOutOfBandInvitation(label, 'aries.vc.holder');
};

/**
 * Creates a verifier invitation
 */
export const createVerifierInvitation = async (label: string = 'Ayra Verifier Test') => {
  return createOutOfBandInvitation(label, 'aries.vc.verify');
};

/**
 * Shuts down the agent and cleans up resources
 */
export const shutdownAgent = async (): Promise<void> => {
  try {
    if (ngrokInstance) {
      await ngrokInstance.disconnect();
      ngrokInstance = null;
    }
    
    if (agent) {
      await agent.agent.shutdown();
      agent = null;
    }
    
    isConnected = false;
    isInitializing = false;
    connectionPromise = null;
    ngrokUrl = null;
    baseUrl = DEFAULT_BASE_URL;
    currentInvitation = null;
    currentQrCode = null;
  } catch (error) {
    console.error('Error during agent shutdown:', error);
  }
};

export const getNgrokUrl = (): string | null => ngrokUrl;
export const getBaseUrl = (): string => baseUrl; 