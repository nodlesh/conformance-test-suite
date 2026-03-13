import React, { useEffect, useState } from "react";
import { VerifierContext } from "@/services/tests/VerifierContext";
import { TestStepController, TestStepStatus } from "@/services/BaseTestContext";

interface VerifierConnectionStepProps {
  context: VerifierContext;
  controller: TestStepController;
  isActive: boolean;
  messages: string[];
  hasStarted: boolean;
  oobUrl: string;
  setOobUrl: (url: string) => void;
  onStart: () => Promise<void>;
}

export function VerifierConnectionStep({
  context,
  controller,
  isActive,
  messages,
  hasStarted,
  oobUrl,
  setOobUrl,
  onStart
}: VerifierConnectionStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSubStep, setCurrentSubStep] = useState<'receive' | 'setup'>('receive');

  // Update status when step becomes active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("running" as TestStepStatus);
    }
  }, [isActive, controller]);

  // Handle start button click
  const handleStart = async () => {
    if (!oobUrl.trim()) {
      setError("Please enter an OOB URL");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onStart();
      setCurrentSubStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start connection setup');
      controller.setError(err instanceof Error ? err.message : 'Failed to start connection setup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Receive Invitation Step */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-blue-900">Receive Invitation</h4>
          <div className={`px-2 py-1 rounded text-sm ${currentSubStep === 'receive' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
            {currentSubStep === 'receive' ? 'In Progress' : 'Completed'}
          </div>
        </div>
        <p className="text-blue-800 text-sm">
          Enter your verifier's OOB URL to establish a connection.
        </p>
      </div>
      
      {!hasStarted ? (
        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="oobUrl" className="text-sm font-medium text-gray-700">
              Verifier OOB URL
            </label>
            <input
              type="text"
              id="oobUrl"
              value={oobUrl}
              onChange={(e) => setOobUrl(e.target.value)}
              placeholder="Enter your verifier's OOB URL"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="btn btn-blue w-full"
          >
            {isLoading ? 'Processing...' : 'Process OOB URL'}
          </button>
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="inline-flex items-center">
            <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12z"></path>
            </svg>
            <span className="ml-2 text-gray-600">
              {currentSubStep === 'receive' ? 'Processing OOB URL...' : 'Establishing connection...'}
            </span>
          </div>
        </div>
      )}

      {/* Setup Connection Step */}
      {currentSubStep === 'setup' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-green-900">Setup Connection</h4>
            <div className="px-2 py-1 rounded text-sm bg-blue-100 text-blue-800">
              In Progress
            </div>
          </div>
          <p className="text-green-800 text-sm">
            Establishing connection with the verifier using the processed OOB URL.
          </p>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-4 space-y-2">
          {messages.map((message, index) => (
            <div key={index} className="text-sm text-gray-600">
              {message}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

