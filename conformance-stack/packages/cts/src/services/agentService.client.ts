import { EventEmitter } from 'events';

declare const window: Window & typeof globalThis;

// Create an event emitter for agent events
export const agentEventEmitter = new EventEmitter();

// Configuration
const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

// Agent state
let ngrokUrl: string | null = null;
let baseUrl: string = DEFAULT_BASE_URL;
let currentInvitation: string | null = null;
let currentQrCode: string | null = null;

interface NgrokStatus {
  ngrokUrl: string | null;
  baseUrl: string;
}

interface DiagnosticsResponse {
  diagnostics?: {
    connections?: {
      ngrokActive?: boolean;
      ngrokUrl?: string;
      baseUrl?: string;
    };
  };
}

/**
 * Creates an OOB invitation specifically for a Holder app to request a presentation
 * Client-side version that calls the server API
 * @param label The label to display in the invitation
 * @returns The invitation details
 */
export const createHolderInvitation = async (label: string = 'Ayra Holder Test') => {
  try {
    const response = await fetch('/api/invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'holder',
        label,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create holder invitation: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating holder invitation:', error);
    throw error;
  }
};

/**
 * Creates an OOB invitation specifically for a Verifier app to request a presentation
 * Client-side version that calls the server API
 * @param label The label to display in the invitation
 * @returns The invitation details
 */
export const createVerifierInvitation = async (label: string = 'Ayra Verifier Test') => {
  try {
    const response = await fetch('/api/invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'verifier',
        label,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create verifier invitation: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating verifier invitation:', error);
    throw error;
  }
};

/**
 * Gets the current URL of the ngrok tunnel
 */
export const getNgrokUrl = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/ngrok-status');
    const data = await response.json() as NgrokStatus;
    return data.ngrokUrl;
  } catch (error) {
    console.error('Error fetching ngrok URL:', error);
    return null;
  }
};

/**
 * Gets the current base URL (ngrok or default)
 */
export const getBaseUrl = async (): Promise<string> => {
  try {
    const response = await fetch('/api/ngrok-status');
    const data = await response.json() as NgrokStatus;
    return data.baseUrl;
  } catch (error) {
    console.error('Error fetching base URL:', error);
    return DEFAULT_BASE_URL;
  }
};

/**
 * Gets the current invitation URL
 */
export const getCurrentInvitation = (): string | null => {
  return currentInvitation;
};

/**
 * Gets the current QR code data
 */
export const getCurrentQrCode = (): string | null => {
  return currentQrCode;
};

/**
 * Sets the current QR code data
 */
export const setCurrentQrCode = (qrCode: string): void => {
  currentQrCode = qrCode;
};

// Initialize the client-side state
if (typeof window !== 'undefined') {
  console.log('Client-side: Checking ngrok status...');
  fetch('/api/diagnostics')
    .then(response => response.json())
    .then((data: unknown) => {
      const diagnostics = data as DiagnosticsResponse;
      if (diagnostics?.diagnostics?.connections?.ngrokActive && diagnostics?.diagnostics?.connections?.ngrokUrl) {
        console.log(`Client: Setting ngrok URL from diagnostics: ${diagnostics.diagnostics.connections.ngrokUrl}`);
        ngrokUrl = diagnostics.diagnostics.connections.ngrokUrl;
        baseUrl = diagnostics.diagnostics.connections.baseUrl || DEFAULT_BASE_URL;
      }
    })
    .catch(error => {
      console.error('Error fetching diagnostics:', error);
    });
} 