import React, { useEffect } from "react";
import { HolderContext } from "@/services/tests/HolderContext";
import { TestStepController } from "@/services/BaseTestContext";

interface PresentationStepProps {
  context: HolderContext;
  controller: TestStepController;
  isActive: boolean;
}

export function PresentationStep({ context, controller, isActive }: PresentationStepProps) {
  // Mark step as waiting when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("waiting");
      // In a real implementation, we would:
      // 1. Send a presentation request
      // 2. Poll for presentation response
    }
  }, [isActive, controller]);
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <p className="mb-4 text-center text-sm text-gray-600">
        {context.credentialStatus === "issued" ? (
          "Credential issued. Requesting presentation from your wallet..."
        ) : (
          "Please complete the credential issuance step first."
        )}
      </p>
      
      {context.credentialStatus === "issued" && (
        <>
          <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md">
            <h3 className="font-semibold mb-2">Presentation Request:</h3>
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Type:</span> Employee Verification</li>
              <li><span className="font-medium">Requested by:</span> Ayra Test Suite</li>
              <li><span className="font-medium">Attributes:</span> Name, Role</li>
            </ul>
          </div>
          
          <button
            onClick={() => {
              // For demo purposes, simulate presentation
              controller.updateContext({
                presentationRequest: {
                  type: "EmployeeVerification",
                  requestedAttributes: ["name", "role"]
                },
                presentationStatus: "verified",
                presentationResult: {
                  verified: true,
                  attributes: {
                    name: "Demo User",
                    role: "Employee"
                  }
                }
              });
              controller.setStatus("passed");
              controller.complete(true);
              controller.goToNextStep();
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Simulate Presentation (Demo)
          </button>
        </>
      )}
    </div>
  );
}
