import React, { useEffect } from "react";
import { HolderContext } from "@/services/tests/HolderContext";
import { TestStepController } from "@/services/BaseTestContext";

interface HolderReportStepProps {
  context: HolderContext;
  controller: TestStepController;
  isActive: boolean;
  onRestart: () => void;
}

export function HolderReportStep({ context, controller, isActive, onRestart }: HolderReportStepProps) {
  // Mark step as passed when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("passed");
      controller.complete(true);
      controller.updateContext({
        reportTimestamp: new Date().toISOString()
      });
    }
  }, [isActive, controller]);
  
  const getOverallStatus = () => {
    if (!context.connectionStatus) return "Incomplete";
    if (!context.presentationStatus) return "Incomplete";
    
    return context.presentationStatus === "verified" ? "Passed" : "Failed";
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
        <h2 className="text-xl font-bold">Holder Conformance Report</h2>
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
            <h3 className="font-semibold">Credential Presentation</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center">
              {context.presentationStatus === "verified" ? (
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
            
            {context.presentationRequest && (
              <div className="mt-3">
                <p className="text-sm font-medium">Requested Attributes:</p>
                <ul className="mt-1 text-sm text-gray-600 list-disc pl-5">
                  {context.presentationRequest.requestedAttributes?.map((attr: string, index: number) => (
                    <li key={index}>{attr}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {context.presentationResult && (
              <div className="mt-4">
                <p className="text-sm font-medium">Presented Attributes:</p>
                <div className="mt-2 bg-gray-100 p-3 rounded">
                  {Object.entries(context.presentationResult.attributes || {}).map(([key, value]) => (
                    <p key={key} className="text-sm">
                      <span className="font-medium">{key}:</span> {value as string}
                    </p>
                  ))}
                </div>
                
                {context.presentationResult.issuanceDate && (
                  <p className="mt-2 text-xs text-gray-600">
                    <span className="font-medium">Issuance Date:</span> {new Date(context.presentationResult.issuanceDate).toLocaleDateString()}
                  </p>
                )}
                
                {context.presentationResult.expirationDate && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Expiration Date:</span> {new Date(context.presentationResult.expirationDate).toLocaleDateString()}
                  </p>
                )}
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
