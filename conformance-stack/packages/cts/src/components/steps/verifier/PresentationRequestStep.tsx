import React, { useEffect } from "react";
import { VerifierContext } from "@/services/tests/VerifierContext";
import { TestStepController } from "@/services/BaseTestContext";
import { TestStepStatus } from "@/components/TestRunner";

interface PresentationRequestStepProps {
  context: VerifierContext;
  controller: TestStepController;
  isActive: boolean;
}

export function PresentationRequestStep({ context, controller, isActive }: PresentationRequestStepProps) {
  // Mark step as running when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("running" as TestStepStatus);
      // In a real implementation, we would:
      // 1. Check if connection is active
      // 2. Send presentation request
      // 3. Poll for request status
    }
  }, [isActive, controller]);
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <p className="mb-4 text-center text-sm text-gray-600">
        {context.connectionStatus === "active" ? (
          "Connection established. Sending presentation request to the wallet..."
        ) : (
          "Please complete the connection step first."
        )}
      </p>
      
      {context.connectionStatus === "active" && (
        <>
          <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md">
            <h3 className="font-semibold mb-2">Presentation Request:</h3>
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Type:</span> Identity Verification</li>
              <li><span className="font-medium">Requested by:</span> Ayra Test Suite</li>
              <li><span className="font-medium">Required Attributes:</span> Name, Date of Birth</li>
            </ul>
          </div>
          
          <button
            onClick={() => {
              // For demo purposes, simulate request
              controller.updateContext({
                requestId: "req-" + Math.random().toString(36).substring(2, 10),
                requestType: "IdentityVerification",
                requestStatus: "sent"
              });
              controller.setStatus("passed");
              controller.complete(true);
              controller.goToNextStep();
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Simulate Request (Demo)
          </button>
        </>
      )}
    </div>
  );
}
