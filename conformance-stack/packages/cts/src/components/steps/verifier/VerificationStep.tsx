import React, { useEffect } from "react";
import { VerifierContext } from "@/services/tests/VerifierContext";
import { TestStepController } from "@/services/BaseTestContext";
import { TestStepStatus } from "@/components/TestRunner";

interface VerificationStepProps {
  context: VerifierContext;
  controller: TestStepController;
  isActive: boolean;
}

export function VerificationStep({ context, controller, isActive }: VerificationStepProps) {
  // Mark step as running when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("running" as TestStepStatus);
      // In a real implementation, we would:
      // 1. Check if request is sent
      // 2. Poll for presentation submission
      // 3. Verify the presentation
    }
  }, [isActive, controller]);
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <p className="mb-4 text-center text-sm text-gray-600">
        {context.requestStatus === "sent" ? (
          "Presentation request sent. Waiting for response..."
        ) : (
          "Please complete the presentation request step first."
        )}
      </p>
      
      {context.requestStatus === "sent" && (
        <>
          <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md mb-4">
            <h3 className="font-semibold mb-2">Request Status:</h3>
            <p className="text-sm">
              Waiting for holder to respond with a presentation...
            </p>
          </div>
          
          <button
            onClick={() => {
              // For demo purposes, simulate verification
              controller.updateContext({
                presentationResult: {
                  id: "pres-" + Math.random().toString(36).substring(2, 10),
                  type: "IdentityVerification",
                  attributes: {
                    name: "Test User",
                    dateOfBirth: "1990-01-01"
                  },
                  issuanceDate: new Date().toISOString()
                },
                verificationStatus: "verified"
              });
              controller.setStatus("passed");
              controller.complete(true);
              controller.goToNextStep();
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Simulate Verification (Demo)
          </button>
        </>
      )}
    </div>
  );
}
