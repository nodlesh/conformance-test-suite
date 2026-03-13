import React, { useState, useEffect } from "react";
import { useSocket } from "../../../contexts/SocketContext";
import { TestStepStatus } from "../../../services/BaseTestContext";
import RenderQRCode from "../../RenderQRCode";

interface IssuerConnectionStepProps {
  onStatusChange: (status: TestStepStatus) => void;
}

export function IssuerConnectionStep({ onStatusChange }: IssuerConnectionStepProps) {
  const socket = useSocket();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [debug, setDebug] = useState<{message: string, timestamp: string}[]>([]);

  // Log debug messages
  const addDebug = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    setDebug(prev => [...prev, {message, timestamp}]);
    console.log(`${timestamp}: ${message}`);
  };

  useEffect(() => {
    if (!socket) return;

    const handleInvitationUrl = (data: { url: string }) => {
      console.log("Received invitation URL:", data);
      addDebug(`Received invitation URL: ${data.url}`);
      setInvitationUrl(data.url);
      setIsLoading(false);
      onStatusChange("running");
    };

    const handleError = (data: { message: string }) => {
      console.error("Connection error:", data);
      addDebug(`Connection error: ${data.message}`);
      setError(data.message);
      setIsLoading(false);
      onStatusChange("failed");
    };

    socket.on("invitationUrl", handleInvitationUrl);
    socket.on("connectionError", handleError);

    return () => {
      socket.off("invitationUrl", handleInvitationUrl);
      socket.off("connectionError", handleError);
    };
  }, [socket, onStatusChange]);

  const handleStart = async () => {
    if (!socket) return;

    try {
      setIsLoading(true);
      setError(null);
      setHasStarted(true);
      addDebug("Starting connection setup...");
      socket.emit("startConnection");
    } catch (err) {
      console.error("Failed to start connection:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to start connection";
      addDebug(`Error: ${errorMessage}`);
      setError(errorMessage);
      setIsLoading(false);
      onStatusChange("failed");
    }
  };

  const retryInvitation = () => {
    setInvitationUrl(null);
    setError(null);
    setHasStarted(false);
    onStatusChange("pending");
  };

  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <div className="mb-4 text-center text-sm">
        <p className="text-gray-600 mb-2">
          Scan this QR code with your mobile wallet app to establish a connection.
        </p>
      </div>

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
        ) : invitationUrl ? (
          <RenderQRCode
            value={invitationUrl}
            size={200}
          />
        ) : (
          <div className="w-200 h-200 flex items-center justify-center bg-gray-100">
            <span className="text-gray-400">No invitation available</span>
          </div>
        )}
      </div>

      {invitationUrl && (
        <div className="mt-2 text-center">
          <p className="text-xs text-gray-500 break-all max-w-md font-mono bg-gray-50 p-2 rounded border border-gray-200">
            {invitationUrl}
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

      {!hasStarted && (
        <div className="mt-4">
          <button
            onClick={handleStart}
            disabled={isLoading}
            className={`px-4 py-2 rounded text-white font-medium transition ${
              isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            Start Connection Setup
          </button>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 flex items-center">
          <div className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
          <p className="text-sm text-gray-600">Starting connection setup...</p>
        </div>
      )}
    </div>
  );
} 