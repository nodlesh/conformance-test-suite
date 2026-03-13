import React, { useEffect } from "react";
import { VerifierContext } from "@/services/tests/VerifierContext";
import { TestStepController } from "@/services/BaseTestContext";
import { TestStepStatus } from "@/components/TestRunner";

interface VerifierReportStepProps {
  context: VerifierContext;
  controller: TestStepController;
  isActive: boolean;
  onRestart: () => void;
}

export function VerifierReportStep({ context, controller, isActive, onRestart }: VerifierReportStepProps) {
  // Mark step as passed when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("passed" as TestStepStatus);
      controller.complete(true);
      controller.updateContext({
        reportTimestamp: new Date().toISOString()
      });
    }
  }, [isActive, controller]);
  
  const getOverallStatus = () => {
    if (!context.connectionStatus) return "Incomplete";
    if (!context.requestStatus) return "Incomplete";
    if (!context.verificationStatus) return "Incomplete";
    
    return context.verificationStatus === "verified" ? "Passed" : "Failed";
  };
  
  const getStatusColor = () => {
    const status = getOverallStatus();
    switch (status) {
      case "Passed": return "bg-green-100 text-green-800";
      case "Incomplete": return "bg-blue-100 text-blue-800";
      case "Failed": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Verifier Conformance Report</h2>
        <div className={`px-3 py-1 rounded-full ${getStatusColor()}`}>
          {getOverallStatus()}
        </div>
      </div>
      
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          Generated on: {new Date(context.reportTimestamp || Date.now()).toLocaleString()}
        </p>
      </div>
      
      <div className="space-y-6">
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold">Connection</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center">
              {context.connectionStatus === "active" ? (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white mr-2">
                    ✓
                  </div>
                  <span>Connection established successfully</span>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white mr-2">
                    ✗
                  </div>
                  <span>Connection not established</span>
                </>
              )}
            </div>
            {context.connectionId && (
              <p className="mt-2 text-sm text-gray-600">Connection ID: {context.connectionId}</p>
            )}
          </div>
        </div>
        
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold">Presentation Request</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center">
              {context.requestStatus === "sent" ? (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white mr-2">
                    ✓
                  </div>
                  <span>Presentation request sent successfully</span>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white mr-2">
                    ✗
                  </div>
                  <span>Presentation request not sent</span>
                </>
              )}
            </div>
            {context.requestId && (
              <p className="mt-2 text-sm text-gray-600">Request ID: {context.requestId}</p>
            )}
            {context.requestType && (
              <p className="mt-1 text-sm text-gray-600">Type: {context.requestType}</p>
            )}
          </div>
        </div>
        
        <div className="border rounded-md overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold">Verification</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center">
              {context.verificationStatus === "verified" ? (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white mr-2">
                    ✓
                  </div>
                  <span>Presentation verified successfully</span>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white mr-2">
                    ✗
                  </div>
                  <span>Presentation not verified</span>
                </>
              )}
            </div>
            {context.presentationResult && (
              <div className="mt-2 bg-gray-100 p-3 rounded">
                <p className="text-sm font-semibold">Presentation Details:</p>
                <pre className="text-xs mt-1">
                  {JSON.stringify(context.presentationResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex justify-end">
        <button
          onClick={onRestart}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Start New Test
        </button>
      </div>
    </div>
  );
}
