import React, { useState, useEffect } from "react";
import { useSocket } from "../../../contexts/SocketContext";
import { TestStepStatus } from "../../../services/BaseTestContext";

interface IssuerCredentialStepProps {
  onStatusChange: (status: TestStepStatus) => void;
}

export function IssuerCredentialStep({ onStatusChange }: IssuerCredentialStepProps) {
  const socket = useSocket();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentialStatus, setCredentialStatus] = useState<string | null>(null);
  const [credentialIssued, setCredentialIssued] = useState(false);
  const [debug, setDebug] = useState<{message: string, timestamp: string}[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleCredentialStatus = (data: { status: string }) => {
      console.log("Credential status update:", data);
      setCredentialStatus(data.status);
      if (data.status === "issued") {
        setIsLoading(false);
        setCredentialIssued(true);
        onStatusChange("passed");
      }
    };

    const handleError = (data: { message: string }) => {
      console.error("Credential error:", data);
      setError(data.message);
      setIsLoading(false);
      onStatusChange("failed");
    };

    socket.on("credentialStatus", handleCredentialStatus);
    socket.on("credentialError", handleError);

    return () => {
      socket.off("credentialStatus", handleCredentialStatus);
      socket.off("credentialError", handleError);
    };
  }, [socket, onStatusChange]);

  const handleIssueCredential = async () => {
    if (!socket) return;

    try {
      setIsLoading(true);
      setError(null);
      socket.emit("issueCredential");
    } catch (err) {
      console.error("Failed to issue credential:", err);
      setError(err instanceof Error ? err.message : "Failed to issue credential");
      setIsLoading(false);
      onStatusChange("failed");
    }
  };

  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <div className="w-full mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-blue-700 font-medium">Issue Employee Credential</p>
        <p className="text-sm text-blue-600 mt-1">
          This will issue a credential containing employee information that can be used for verification.
        </p>
        <div className="mt-2 text-xs text-gray-600">
          <p><span className="font-medium">Credential Type:</span> EmployeeCredential</p>
          <p><span className="font-medium">Attributes:</span> name, role, company, employeeId</p>
        </div>
      </div>

      {!credentialIssued ? (
        <div className="w-full">
          <h3 className="font-semibold mb-3">Issue Credential</h3>
          <p className="text-sm text-gray-600 mb-4">
            Click the button below to issue a new employee credential.
          </p>

          <button
            onClick={handleIssueCredential}
            disabled={isLoading}
            className={`w-full py-2 rounded text-white font-medium transition ${
              isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin h-4 w-4 border-t-2 border-b-2 border-white rounded-full mr-2"></span>
                Issuing Credential...
              </span>
            ) : (
              'Issue Credential'
            )}
          </button>
        </div>
      ) : (
        <div className="w-full">
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <h3 className="font-semibold text-green-700 mb-2">Credential Issued Successfully</h3>
            <p className="text-sm text-green-600">
              The employee credential has been issued and is ready for use.
            </p>
            {credentialStatus && (
              <div className="mt-2 text-xs text-gray-600">
                <p><span className="font-medium">Status:</span> {credentialStatus}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="w-full mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
} 