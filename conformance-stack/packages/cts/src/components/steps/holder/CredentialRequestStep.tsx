import React, { useState, useEffect } from "react";
import { HolderContext } from "@/services/tests/HolderContext";
import { TestStepController } from "@/services/BaseTestContext";
import RenderQRCode from "@/components/RenderQRCode";

interface CredentialRequestStepProps {
  context: HolderContext;
  controller: TestStepController;
  isActive: boolean;
}

export function CredentialRequestStep({ context, controller, isActive }: CredentialRequestStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestQRValue, setRequestQRValue] = useState("");
  
  // Mark step as waiting when active
  useEffect(() => {
    if (isActive) {
      controller.setStatus("waiting");
      
      // Assume credential is already issued
      controller.updateContext({
        credentialId: "vc-" + Math.random().toString(36).substring(2, 10),
        credentialType: "EmployeeCredential",
        credentialStatus: "issued"
      });
    }
  }, [isActive, controller]);
  
  const sendPresentationRequest = () => {
    setIsLoading(true);
    
    setTimeout(() => {
      // Create mock presentation request
      const presentationRequest = {
        id: "pr-" + Math.random().toString(36).substring(2, 10),
        type: "EmployeeVerification",
        requestedAttributes: ["name", "role", "company", "employeeId"],
        verifierDID: "did:example:verifier123",
        challenge: Math.random().toString(36).substring(2),
        domain: "ayra.conformance.test"
      };
      
      // In a real implementation, this would encode the request as a QR code URL
      const requestUrl = `https://example.org/request?request=${encodeURIComponent(JSON.stringify(presentationRequest))}`;
      
      controller.updateContext({
        presentationRequest: presentationRequest
      });
      
      setRequestQRValue(requestUrl);
      setRequestSent(true);
      setIsLoading(false);
    }, 1500);
  };
  
  const simulatePresentation = () => {
    setIsLoading(true);
    
    setTimeout(() => {
      // Simulate successful presentation
      controller.updateContext({
        presentationStatus: "verified",
        presentationResult: {
          verified: true,
          attributes: {
            name: "Demo User",
            role: "Software Developer",
            company: "Acme Inc.",
            employeeId: "EMP-1234"
          },
          issuanceDate: new Date().toISOString(),
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
      
      controller.setStatus("passed");
      controller.complete(true);
      controller.goToNextStep();
      setIsLoading(false);
    }, 1500);
  };
  
  if (!context.connectionStatus || context.connectionStatus !== "active") {
    return (
      <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
        <div className="text-amber-600 bg-amber-50 p-4 rounded-md w-full">
          <p className="font-medium">Connection Required</p>
          <p className="text-sm mt-1">Please complete the connection step before requesting credentials.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
      <div className="w-full mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-blue-700 font-medium">Credential Already Issued</p>
        <p className="text-sm text-blue-600 mt-1">
          This test assumes you already have the required credential in your wallet. You will now be asked to present this credential.
        </p>
        {context.credentialId && (
          <div className="mt-2 text-xs text-gray-600">
            <p><span className="font-medium">Credential ID:</span> {context.credentialId}</p>
            <p><span className="font-medium">Type:</span> {context.credentialType}</p>
          </div>
        )}
      </div>
      
      {!requestSent ? (
        <div className="w-full">
          <h3 className="font-semibold mb-3">Request Credential Presentation</h3>
          <p className="text-sm text-gray-600 mb-4">
            Click the button below to generate a presentation request. You'll be able to scan this with your wallet to share your credential.
          </p>
          
          <button
            onClick={sendPresentationRequest}
            disabled={isLoading}
            className={`w-full py-2 rounded text-white font-medium transition ${
              isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <span className="animate-spin h-4 w-4 border-t-2 border-b-2 border-white rounded-full mr-2"></span>
                Generating Request...
              </span>
            ) : (
              'Generate Presentation Request'
            )}
          </button>
        </div>
      ) : (
        <div className="w-full">
          <h3 className="font-semibold mb-3">Scan to Present Credential</h3>
          <p className="text-sm text-gray-600 mb-4">
            Scan this QR code with your mobile wallet to present your credential.
          </p>
          
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-lg shadow-md mb-4">
              <RenderQRCode value={requestQRValue} size={200} />
            </div>
            
            <div className="bg-gray-100 p-3 rounded-md w-full mb-4">
              <h4 className="font-medium text-sm mb-2">Requested Attributes:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Name</li>
                <li>• Role</li>
                <li>• Company</li>
                <li>• Employee ID</li>
              </ul>
            </div>
            
            <button
              onClick={simulatePresentation}
              disabled={isLoading}
              className={`w-full py-2 rounded text-white font-medium transition ${
                isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin h-4 w-4 border-t-2 border-b-2 border-white rounded-full mr-2"></span>
                  Processing...
                </span>
              ) : (
                'Simulate Credential Presentation (Demo)'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
