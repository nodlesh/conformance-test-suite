import React, { useEffect } from "react";
import { HolderContext } from "@/services/tests/HolderContext";
import { TestStepController } from "@/services/BaseTestContext";

interface CredentialIssuanceStepProps {
  context: HolderContext;
  controller: TestStepController;
  isActive: boolean;
}

export function CredentialIssuanceStep({ context, controller, isActive }: CredentialIssuanceStepProps) {
  // Mark step as waiting when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("waiting");
      // In a real implementation, we would:
      // 1. Check if connection is active
      // 2. Send credential offer
      // 3. Poll for credential issuance status
    }
  }, [isActive, controller]);
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <p className="mb-4 text-center text-sm text-gray-600">
        {context.connectionStatus === "active" ? (
          "Connection established. Issuing credential to your wallet..."
        ) : (
          "Please complete the connection step first."
        )}
      </p>
      
      {context.connectionStatus === "active" && (
        <>
          <div className="bg-gray-100 p-4 rounded-lg w-full max-w-md">
            <h3 className="font-semibold mb-2">Credential Details:</h3>
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Type:</span> Employee Credential</li>
              <li><span className="font-medium">Issuer:</span> Ayra Test Suite</li>
              <li><span className="font-medium">Claims:</span> Name, Role, Department</li>
            </ul>
          </div>
          
          <button
            onClick={() => {
              // For demo purposes, simulate credential issuance
              controller.updateContext({
                credentialId: "cred-" + Math.random().toString(36).substring(2, 10),
                credentialType: "EmployeeCredential",
                credentialStatus: "issued"
              });
              controller.setStatus("passed");
              controller.complete(true);
              controller.goToNextStep();
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Simulate Acceptance (Demo)
          </button>
        </>
      )}
    </div>
  );
}
