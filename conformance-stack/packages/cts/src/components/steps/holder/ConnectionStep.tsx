import React, { useState, useEffect } from "react";
import { HolderContext } from "@/services/tests/HolderContext";
import { TestStepController } from "@/services/BaseTestContext";
import RenderQRCode from "@/components/RenderQRCode";
import { createInvitation, waitForConnection, simulateConnection } from "@/services/connection";
import { getBaseUrl, getNgrokUrl } from "@/services/agentService";

interface ConnectionStepProps {
  context: HolderContext;
  controller: TestStepController;
  isActive: boolean;
}

export function ConnectionStep({ context, controller, isActive }: ConnectionStepProps) {
  const [qrValue, setQrValue] = useState("");
  const [invitation, setInvitation] = useState<{ id: string; url: string; oobInvitation: any } | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingStarted, setWaitingStarted] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debug, setDebug] = useState<{message: string, timestamp: string}[]>([]);
  
  // Add a state to track ngrok status from the server
  const [serverNgrokStatus, setServerNgrokStatus] = useState<{ ngrokActive: boolean; ngrokUrl: string | null; baseUrl: string } | null>(null);

  // Add an effect to check ngrok status from the server
  useEffect(() => {
    const checkServerNgrokStatus = async () => {
      try {
        const response = await fetch('/api/ngrok-status');
        const data = await response.json();
        setServerNgrokStatus(data);
        console.log('Server ngrok status:', data);
      } catch (error) {
        console.error('Error fetching ngrok status:', error);
      }
    };

    checkServerNgrokStatus();
    // Check every 5 seconds in case ngrok status changes
    const interval = setInterval(checkServerNgrokStatus, 5000);
    return () => clearInterval(interval);
  }, []);
  
  // Mark step as waiting when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("waiting");
      getBaseUrl().then(url => setBaseUrl(url));
    }
  }, [isActive, controller]);
  
  // Log debug messages
  const addDebug = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    setDebug(prev => [...prev, {message, timestamp}]);
    console.log(`${timestamp}: ${message}`);
  };
  
  // Create invitation when component becomes active
  useEffect(() => {
    if (isActive && !invitation && !isLoading) {
      const createConnectionInvitation = async () => {
        setIsLoading(true);
        setError(null);
        setDebug([]);
        
        addDebug("Creating connection invitation...");
        
        try {          
          // Show the base URL being used
          const currentBaseUrl = await getBaseUrl();
          const ngrokUrl = await getNgrokUrl();
          addDebug(`Base URL: ${currentBaseUrl}`);
          
          // Add client-side check for ngrok URL
          let isNgrokUp = false;
          try {
            // Try to fetch the current status from server
            const statusResponse = await fetch('/api/ngrok-status');
            const statusData = await statusResponse.json();
            isNgrokUp = statusData?.ngrokActive || false;
            
            if (isNgrokUp && statusData?.ngrokUrl) {
              addDebug(`Server reports ngrok is active: ${statusData.ngrokUrl}`);
              // Update our local state with server's ngrok URL if needed
              if (!ngrokUrl) {
                addDebug(`Updating local state with server ngrok URL`);
              }
            } else {
              addDebug(`Server reports ngrok is not active. Using local URL.`);
            }
          } catch (statusError) {
            console.error('Error checking ngrok status:', statusError);
            addDebug(`Error checking ngrok status API: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
          }
          
          if (ngrokUrl) {
            addDebug(`Ngrok tunnel URL from client state: ${ngrokUrl}`);
          } else if (isNgrokUp && serverNgrokStatus?.ngrokUrl) {
            addDebug(`Using ngrok URL from server: ${serverNgrokStatus.ngrokUrl}`);
          } else {
            addDebug("WARNING: No ngrok tunnel detected. Mobile devices will need to be on the same network.");
          }
          
          // Create the invitation - this calls the connection service
          addDebug("Calling createInvitation('Ayra Holder Test')...");
          const newInvitation = await createInvitation('Ayra Holder Test');
          
          // Check invitation information
          addDebug(`Invitation created with ID: ${newInvitation.id}`);
          addDebug(`Invitation URL: ${newInvitation.url}`);
          
          // Check if service endpoint is using ngrok
          const serviceEndpoint = newInvitation.oobInvitation?.services?.[0]?.serviceEndpoint;
          if (serviceEndpoint) {
            addDebug(`Service endpoint: ${serviceEndpoint}`);
            const anyNgrokUrl = ngrokUrl || serverNgrokStatus?.ngrokUrl;
            if (anyNgrokUrl && !serviceEndpoint.includes('ngrok')) {
              addDebug(`WARNING: Service endpoint doesn't seem to use ngrok URL!`);
            }
          }
          
          setInvitation(newInvitation);
          setQrValue(newInvitation.url);
          setBaseUrl(currentBaseUrl);
        } catch (error) {
          console.error("Error creating invitation:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          addDebug(`Error: ${errorMessage}`);
          setError(`Failed to create invitation: ${errorMessage}`);
          controller.setError(`Failed to create invitation: ${errorMessage}`);
          controller.setStatus("failed");
        } finally {
          setIsLoading(false);
        }
      };
      
      createConnectionInvitation();
    }
  }, [isActive, invitation, controller, isLoading, serverNgrokStatus]);
  
  // Start waiting for connection
  const startWaiting = async () => {
    if (!invitation || isWaiting) return;
    
    setIsWaiting(true);
    setWaitingStarted(true);
    controller.setStatus("running");
    
    try {
      console.log("Waiting for connection...");
      const connected = await waitForConnection(invitation.id);
      
      if (connected) {
        console.log("Connection established successfully");
        // Update context with connection details
        controller.updateContext({
          connectionId: invitation.id,
          connectionStatus: "active",
          oobInvitation: invitation.oobInvitation
        });
        controller.setStatus("passed");
        controller.complete(true);
        controller.goToNextStep();
      }
    } catch (error) {
      console.error("Connection failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Connection failed: ${errorMessage}`);
      controller.setError(`Connection failed: ${errorMessage}`);
      controller.setStatus("failed");
      setIsWaiting(false);
    }
  };
  
  const retryInvitation = () => {
    setInvitation(null);
    setQrValue("");
    setError(null);
    controller.setError(null);
    controller.setStatus("waiting");
  };
  
  // Determine if ngrok is active using either local state or server state
  const isNgrokActive = !!getNgrokUrl() || (serverNgrokStatus?.ngrokActive || false);
  const actualNgrokUrl = getNgrokUrl() || (serverNgrokStatus?.ngrokUrl || null);
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <div className="mb-4 text-center text-sm">
        <p className="text-gray-600 mb-2">
          Scan this QR code with your mobile wallet app to establish a connection.
        </p>
        
        {baseUrl && (
          <p className="text-xs text-gray-500">
            Base URL: <span className="font-mono bg-gray-100 px-1 rounded">{baseUrl}</span>
          </p>
        )}
        
        {isNgrokActive && actualNgrokUrl && (
          <p className="text-xs text-green-500 mt-1">
            ✓ <span className="font-semibold">ngrok tunnel active:</span> <span className="font-mono bg-gray-100 px-1 rounded">{actualNgrokUrl}</span>
          </p>
        )}
        
        {invitation && (
          <p className="text-xs text-gray-500 mt-1">
            Invitation ID: <span className="font-mono bg-gray-100 px-1 rounded">{invitation.id}</span>
          </p>
        )}
      </div>
      
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
      
      {error && (
        <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
          <button 
            onClick={retryInvitation} 
            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded-md text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}
      
      <div className="bg-white p-4 rounded-lg shadow-md">
        {isLoading ? (
          <div className="w-200 h-200 flex flex-col items-center justify-center bg-gray-100">
            <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full mb-2"></div>
            <span className="text-gray-400">Generating invitation...</span>
          </div>
        ) : qrValue ? (
          <RenderQRCode
            value={qrValue}
            size={200}
          />
        ) : (
          <div className="w-200 h-200 flex items-center justify-center bg-gray-100">
            <span className="text-gray-400">No invitation available</span>
          </div>
        )}
      </div>
      
      {qrValue && (
        <div className="mt-2 text-center">
          <p className="text-xs text-gray-500 break-all max-w-md font-mono bg-gray-50 p-2 rounded border border-gray-200">
            {qrValue}
          </p>
        </div>
      )}
      
      {/* Debug log */}
      {debug.length > 0 && (
        <details className="mt-4 text-xs border border-gray-200 rounded p-2">
          <summary className="font-medium cursor-pointer">Debug Log</summary>
          <div className="mt-2 bg-gray-50 p-2 rounded max-h-60 overflow-auto font-mono">
            {debug.map((entry, i) => (
              <div key={i} className="text-xs mb-1">
                <span className="text-gray-500">[{entry.timestamp}]</span> {entry.message}
              </div>
            ))}
          </div>
        </details>
      )}

      {serverNgrokStatus && (
        <details className="mt-2 text-xs border border-gray-200 rounded p-2">
          <summary className="font-medium cursor-pointer">Server Status</summary>
          <div className="mt-2 bg-gray-50 p-2 rounded font-mono">
            <div>Ngrok Active: {serverNgrokStatus.ngrokActive ? 'Yes' : 'No'}</div>
            <div>Ngrok URL: {serverNgrokStatus.ngrokUrl || 'Not available'}</div>
            <div>Base URL: {serverNgrokStatus.baseUrl}</div>
          </div>
        </details>
      )}
      
      <p className="mt-4 text-center text-sm text-gray-500">
        {isWaiting ? "Waiting for connection..." : "Ready to establish connection"}
      </p>
      
      <div className="mt-4 flex flex-col md:flex-row gap-3">
        {!waitingStarted && (
          <button
            onClick={startWaiting}
            disabled={isWaiting || !invitation || isLoading}
            className={`px-4 py-2 rounded text-white font-medium transition ${
              isWaiting || !invitation || isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            Start Waiting for Connection
          </button>
        )}
        
        <button
          onClick={() => {
            // For demo purposes, simulate connection completion
            if (invitation) {
              simulateConnection(invitation.id);
            } else {
              const mockId = "conn-" + Math.random().toString(36).substring(2, 10);
              controller.updateContext({
                connectionId: mockId,
                connectionStatus: "active"
              });
              controller.setStatus("passed");
              controller.complete(true);
              controller.goToNextStep();
            }
          }}
          disabled={isWaiting && !waitingStarted || isLoading}
          className={`px-4 py-2 rounded text-white font-medium transition ${
            isWaiting && !waitingStarted || isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          Simulate Connection (Demo)
        </button>
      </div>
      
      {isWaiting && (
        <div className="mt-4 flex items-center">
          <div className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
          <p className="text-sm text-gray-600">Waiting for wallet to connect...</p>
        </div>
      )}
    </div>
  );
}
