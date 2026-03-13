import React, { useEffect, useState } from "react";
import { TestContext, TestStepController } from "@/services/TestContext";
import { runAllConformanceTests } from "@/services/trustRegistryApi";

interface ApiConformanceStepProps {
    context: TestContext;
    controller: TestStepController;
    isActive: boolean;
}

export function ApiConformanceStep({ context, controller, isActive }: ApiConformanceStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    
    // Automatically start API tests when this step becomes active
    useEffect(() => {
        if (isActive && context.apiBaseUrl) {
            runTests();
        }
    }, [isActive, context.apiBaseUrl]);
    
    const runTests = async () => {
        if (!context.apiBaseUrl) {
            controller.setError("No API base URL available. Please resolve a DID with a TRQP service endpoint first.");
            controller.setStatus("failed");
            return;
        }
        
        if (!context.ecosystemDID) {
            controller.setError("No Ecosystem DID provided");
            controller.setStatus("failed");
            return;
        }
        
        setIsLoading(true);
        controller.setStatus("running");
        controller.setError(null);
        
        try {
            if (!context.apiBaseUrl) {
                throw new Error("API base URL is not available");
            }
            
            console.log("Using API base URL from DID document:", context.apiBaseUrl);
            const report = await runAllConformanceTests(
                context.apiBaseUrl,
                "", // No bearer token for now
                context.entityId || "did:example:entity123",
                context.authorizationId || "did:example:authz",
                context.ecosystemDID,
                context.ecosystemDID
            );
            
            // Update context with test results
            controller.updateContext({
                apiTestReport: report
            });
            
            const allPassed = report.failedCount === 0;
            controller.setStatus(allPassed ? "passed" : "failed");
            controller.complete(allPassed);
            
            // Proceed to next step even if some tests failed
            setTimeout(() => controller.goToNextStep(), 1000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            controller.setError(errorMessage);
            controller.setStatus("failed");
            controller.updateContext({
                errors: {
                    ...context.errors,
                    apiTest: errorMessage
                }
            });
            controller.complete(false);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex flex-col p-4 border border-gray-300 rounded">
            {isLoading ? (
                <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                    <span className="text-gray-600">Running API conformance tests...</span>
                </div>
            ) : context.apiTestReport ? (
                <div className="w-full">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">Test Results Summary</h3>
                        <div className="flex space-x-4">
                            <div className="bg-green-100 p-3 rounded flex-1 text-center">
                                <p className="text-green-700 font-bold text-xl">{context.apiTestReport.passedCount}</p>
                                <p className="text-green-700">Passed</p>
                            </div>
                            <div className="bg-red-100 p-3 rounded flex-1 text-center">
                                <p className="text-red-700 font-bold text-xl">{context.apiTestReport.failedCount}</p>
                                <p className="text-red-700">Failed</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-2">Detailed Results</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {context.apiTestReport.testResults.map((test, idx) => (
                                <div key={idx} className="border rounded overflow-hidden">
                                    <div className={`p-3 flex justify-between items-center ${
                                        test.status === 'passed' ? 'bg-green-50 border-b border-green-200' : 'bg-red-50 border-b border-red-200'
                                    }`}>
                                        <div>
                                            <h4 className="font-semibold">{test.name}</h4>
                                            <p className="text-sm text-gray-600">{test.description}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-sm ${
                                            test.status === 'passed' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                        }`}>
                                            {test.status.toUpperCase()}
                                        </span>
                                    </div>
                                    
                                    {test.details && (
                                        <div className="p-3 bg-gray-50 border-b border-gray-200">
                                            <p className="text-sm font-medium text-gray-700">Details:</p>
                                            <p className="text-sm text-gray-600">{test.details}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : context.errors?.apiTest ? (
                <div className="text-center py-4 text-red-500">
                    <p className="font-semibold">Error:</p>
                    <p>{context.errors.apiTest}</p>
                    
                    <button
                        onClick={runTests}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Try Again
                    </button>
                </div>
            ) : (
                <div className="text-center py-4">
                    <p className="text-gray-500 italic">
                        Ready to run API conformance tests against: {context.apiBaseUrl}
                    </p>
                    
                    <button
                        onClick={runTests}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Run Tests
                    </button>
                </div>
            )}
        </div>
    );
}
