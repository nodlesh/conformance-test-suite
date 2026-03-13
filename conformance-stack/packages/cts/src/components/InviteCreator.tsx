import React, { useState, useEffect, useRef } from 'react';
import RenderQRCode from './RenderQRCode';
import { createHolderInvitation, createVerifierInvitation, getCurrentInvitation, getNgrokUrl } from '@/services/agentService';
import { CheckIcon } from '@heroicons/react/24/outline';
import { DocumentDuplicateIcon as CopyIcon } from '@heroicons/react/24/outline';

declare global {
  interface Window {
    clipboard: {
      writeText(text: string): Promise<void>;
    };
  }
}

interface NgrokStatus {
  ngrokActive: boolean;
  ngrokUrl?: string;
}

interface InviteCreatorProps {
  type: 'holder' | 'verifier';
  label?: string;
  showQr?: boolean;
  showLink?: boolean;
  size?: number;
}

const InviteCreator: React.FC<InviteCreatorProps> = ({
  type,
  label,
  showQr = true,
  showLink = true,
  size = 256,
}) => {
  const [invitation, setInvitation] = useState<{ id: string; invitationUrl: string; outOfBandInvitation: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState<string | null>(null);
  const [serverNgrokStatus, setServerNgrokStatus] = useState<NgrokStatus | null>(null);
  const [debug, setDebug] = useState<{message: string, timestamp: string}[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check server-side ngrok status
  useEffect(() => {
    const checkServerNgrokStatus = async () => {
      try {
        const response = await fetch('/api/ngrok-status');
        const data = await response.json() as NgrokStatus;
        setServerNgrokStatus(data);
        
        // Update local ngrok URL if it's available from server but not in client state
        if (data.ngrokActive && data.ngrokUrl && !ngrokUrl) {
          console.log(`Updating local ngrok URL from server: ${data.ngrokUrl}`);
          setNgrokUrl(data.ngrokUrl);
        }
      } catch (error) {
        console.error('Error fetching ngrok status:', error);
      }
    };
    
    checkServerNgrokStatus();
    // Check periodically
    const interval = setInterval(checkServerNgrokStatus, 5000);
    return () => clearInterval(interval);
  }, [ngrokUrl]);

  // Log debug messages
  const addDebug = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    setDebug(prev => [...prev, {message, timestamp}]);
    console.log(`${timestamp}: ${message}`);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        setDebug([]);
        
        addDebug("Creating invitation...");
        
        // Get ngrok URL for display
        const currentNgrokUrl = await getNgrokUrl();
        setNgrokUrl(currentNgrokUrl);
        
        // Get server-side ngrok status
        try {
          const response = await fetch('/api/ngrok-status');
          const data = await response.json() as NgrokStatus;
          setServerNgrokStatus(data);
          addDebug(`Server ngrok status: ${JSON.stringify(data)}`);
          
          if (data.ngrokActive && data.ngrokUrl) {
            addDebug(`Server reports ngrok active: ${data.ngrokUrl}`);
          } else {
            addDebug(`Server reports ngrok not active. Using default URL.`);
          }
        } catch (statusError) {
          addDebug(`Error checking server status: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
        }
        
        // Create the appropriate invitation type
        let result;
        if (type === 'holder') {
          addDebug("Creating holder invitation...");
          result = await createHolderInvitation(label || 'Ayra Holder Test');
        } else {
          addDebug("Creating verifier invitation...");
          result = await createVerifierInvitation(label || 'Ayra Verifier Test');
        }
        
        addDebug(`Invitation created with URL: ${result.invitationUrl}`);
        setInvitation(result);
      } catch (err) {
        console.error('Error creating invitation:', err);
        setError('Failed to create invitation. Check console for details.');
        addDebug(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [type, label]);

  const handleCopyClick = () => {
    if (!invitation?.invitationUrl || !inputRef.current) return;

    try {
      inputRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Determine if ngrok is active using either local state or server state
  const isNgrokActive = !!ngrokUrl || (serverNgrokStatus?.ngrokActive || false);
  const actualNgrokUrl = ngrokUrl || (serverNgrokStatus?.ngrokUrl || null);

  if (loading) {
    return <div className="flex justify-center items-center p-4">Loading invitation...</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-100 text-red-800 rounded">{error}</div>;
  }

  if (!invitation) {
    return <div className="p-4 bg-yellow-100 text-yellow-800 rounded">No invitation generated</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold mb-4">
        {type === 'holder' ? 'Holder' : 'Verifier'} Invitation
      </h2>
      
      {actualNgrokUrl && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-sm">
          <div className="font-medium">Using ngrok tunnel:</div>
          <div className="truncate text-blue-600">{actualNgrokUrl}</div>
        </div>
      )}
      
      {!isNgrokActive && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700 text-sm">
          <p className="font-semibold">⚠️ No ngrok tunnel detected!</p>
          <p>This invitation will only work on devices on the same network.</p>
          <p className="mt-1">To enable mobile wallet connections:</p>
          <ol className="list-decimal list-inside mt-1 ml-2">
            <li>Get a free ngrok auth token from <a href="https://dashboard.ngrok.com" target="_blank" className="text-blue-600 underline">dashboard.ngrok.com</a></li>
            <li>Add the token to your .env.local file as NGROK_AUTH_TOKEN</li>
            <li>Restart the server</li>
          </ol>
        </div>
      )}

      {showQr && (
        <div className="flex justify-center mb-6">
          <RenderQRCode 
            value={invitation.invitationUrl} 
            size={size}
            level="M"
          />
        </div>
      )}

      {showLink && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invitation URL
          </label>
          <div className="flex items-center">
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={invitation.invitationUrl}
              className="flex-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-sm"
            />
            <button
              onClick={handleCopyClick}
              className="ml-2 p-2 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              title="Copy invitation URL"
            >
              {copied ? (
                <CheckIcon className="h-5 w-5 text-green-500" />
              ) : (
                <CopyIcon className="h-5 w-5 text-gray-500" />
              )}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        <p>Scan this QR code with a mobile wallet app or copy the URL to establish a connection.</p>
      </div>
      
      {/* Debug information - hidden by default */}
      {debug.length > 0 && (
        <details className="mt-4 text-xs border border-gray-200 rounded p-2">
          <summary className="font-medium cursor-pointer">Debug Information</summary>
          <div className="mt-2 bg-gray-50 p-2 rounded max-h-60 overflow-auto font-mono">
            {debug.map((entry, i) => (
              <div key={i} className="text-xs mb-1">
                <span className="text-gray-500">[{entry.timestamp}]</span> {entry.message}
              </div>
            ))}
            
            <div className="mt-2 pt-2 border-t border-gray-300">
              <div className="font-medium">Connection Status:</div>
              <div className="text-xs mt-1">
                <div>Client ngrok URL: {ngrokUrl || 'Not set'}</div>
                <div>Server ngrok active: {serverNgrokStatus?.ngrokActive ? 'Yes' : 'No'}</div>
                <div>Server ngrok URL: {serverNgrokStatus?.ngrokUrl || 'Not set'}</div>
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
};

export default InviteCreator;
