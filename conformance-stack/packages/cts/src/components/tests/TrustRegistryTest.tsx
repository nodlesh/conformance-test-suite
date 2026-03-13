import React, { useState, useEffect } from "react";
import { TestRunner, TestStep } from "@/components/TestRunner";
import { TrustRegistryContext, createEmptyTrustRegistryContext } from "@/services/tests/TrustRegistryContext";
import { TestStepStatus } from "@/services/BaseTestContext";

// Import step components
import { DIDResolutionStep } from "@/components/steps/DIDResolutionStep";
import { ApiConformanceStep } from "@/components/steps/ApiConformanceStep";
import { AuthorizationVerificationStep } from "@/components/steps/AuthorizationVerificationStep";
import { RecognitionVerificationStep } from "@/components/steps/RecognitionVerificationStep";
import { ReportStep } from "@/components/steps/ReportStep";

type TrustRegistryErrors = { didResolution: string | null; apiTest: string | null; authVerification: string | null; recognitionVerification: string | null };

export function TrustRegistryTest() {
  const [context, setContext] = useState<TrustRegistryContext>(createEmptyTrustRegistryContext());
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TestStep[]>([]);

  // Update steps' isActive property when currentStep changes
  useEffect(() => {
    setSteps(prevSteps => 
      prevSteps.map((step, index) => ({
        ...step,
        isActive: index === currentStep
      }))
    );
  }, [currentStep]);
  
  // Update context
  const updateContext = (updates: Omit<TrustRegistryContext, 'errors'> & { errors: TrustRegistryErrors }) => {
    setContext(prevContext => {
      const mergedErrors = {
        ...prevContext.errors,
        ...updates.errors,
      };
      return {
        ...prevContext,
        ...updates,
        errors: {
          ...mergedErrors,
          didResolution: mergedErrors.didResolution ?? null,
          apiTest: mergedErrors.apiTest ?? null,
          authVerification: mergedErrors.authVerification ?? null,
          recognitionVerification: mergedErrors.recognitionVerification ?? null,
        } as TrustRegistryErrors
      };
    });
  };
  
  // Update step status
  const updateStepStatus = (stepIndex: number, status: TestStepStatus) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      if (newSteps[stepIndex]) {
        newSteps[stepIndex] = {
          ...newSteps[stepIndex],
          status
        };
      }
      return newSteps;
    });
  };
  
  // Reset and restart
  const handleRestart = () => {
    setContext(createEmptyTrustRegistryContext());
    setCurrentStep(0);
    setSteps(prevSteps => 
      prevSteps.map(step => ({
        ...step,
        status: "pending",
        isActive: step.id === 1
      }))
    );
  };
  
  // Initialize steps
  useEffect(() => {
    const initialSteps: TestStep[] = [
      {
        id: 1,
        name: "Resolve DID",
        description: "Configure the ecosystem DID and TRQP endpoint, then resolve it.",
        status: "pending",
        component: (
          <DIDResolutionStep
            context={context}
            controller={{
              setStatus: (status) => updateStepStatus(0, status),
              setError: (error) => updateContext({
                errors: {
                  didResolution: error,
                  apiTest: context.errors?.apiTest ?? null,
                  authVerification: context.errors?.authVerification ?? null,
                  recognitionVerification: context.errors?.recognitionVerification ?? null,
                } as TrustRegistryErrors
              }),
              complete: () => {},
              updateContext: updateContext as any,
              goToNextStep: () => setCurrentStep(1)
            }}
            isActive={currentStep === 0}
          />
        ),
        isActive: currentStep === 0
      },
      {
        id: 2,
        name: "Ayra Extension API Tests",
        description: "Exercise the additional Ayra APIs for metadata, lookups, and recognitions.",
        status: "pending",
        component: (
          <ApiConformanceStep
            context={context}
            controller={{
              setStatus: (status) => updateStepStatus(1, status),
              setError: (error) => updateContext({
                errors: {
                  didResolution: context.errors?.didResolution ?? null,
                  apiTest: error,
                  authVerification: context.errors?.authVerification ?? null,
                  recognitionVerification: context.errors?.recognitionVerification ?? null,
                } as TrustRegistryErrors
              }),
              complete: () => {},
              updateContext: updateContext as any,
              goToNextStep: () => setCurrentStep(2)
            }}
            isActive={currentStep === 1}
          />
        ),
        isActive: currentStep === 1
      },
      {
        id: 3,
        name: "Authorization Verification",
        description: "Provide an entity and authorization, then verify the TRQP authorization response.",
        status: "pending",
        component: (
          <AuthorizationVerificationStep
            context={context}
            controller={{
              setStatus: (status) => updateStepStatus(2, status),
              setError: (error) => updateContext({
                errors: {
                  didResolution: context.errors?.didResolution ?? null,
                  apiTest: context.errors?.apiTest ?? null,
                  authVerification: error,
                  recognitionVerification: context.errors?.recognitionVerification ?? null,
                } as TrustRegistryErrors
              }),
              complete: () => {},
              updateContext: updateContext as any,
              goToNextStep: () => setCurrentStep(3)
            }}
            isActive={currentStep === 2}
          />
        ),
        isActive: currentStep === 2
      },
      {
        id: 4,
        name: "Recognition Verification",
        description: "Check whether one ecosystem recognizes another via TRQP.",
        status: "pending",
        component: (
          <RecognitionVerificationStep
            context={context}
            controller={{
              setStatus: (status) => updateStepStatus(3, status),
              setError: (error) => updateContext({
                errors: {
                  didResolution: context.errors?.didResolution ?? null,
                  apiTest: context.errors?.apiTest ?? null,
                  authVerification: context.errors?.authVerification ?? null,
                  recognitionVerification: error,
                } as TrustRegistryErrors
              }),
              complete: () => {},
              updateContext: updateContext as any,
              goToNextStep: () => setCurrentStep(4)
            }}
            isActive={currentStep === 3}
          />
        ),
        isActive: currentStep === 3
      },
      {
        id: 5,
        name: "Report",
        description: "Review the test results",
        status: "pending",
        component: (
          <ReportStep
            context={context}
            controller={{
              setStatus: (status) => updateStepStatus(4, status),
              setError: () => {},
              complete: () => {},
              updateContext: updateContext as any,
              goToNextStep: () => {}
            }}
            isActive={currentStep === 4}
            onRestart={handleRestart}
          />
        ),
        isActive: currentStep === 4
      }
    ];
    
    setSteps(prevSteps =>
      initialSteps.map((step, idx) => ({
        ...step,
        status: prevSteps[idx]?.status || step.status,
      }))
    );
  }, [currentStep, context]);

  return (
    <TestRunner
      title="Trust Registry Conformance Test"
      description="This test verifies if a Trust Registry meets the TRQP conformance requirements."
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onRestart={handleRestart}
    />
  );
}
