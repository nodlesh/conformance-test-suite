import React, { useState, useEffect } from "react";
import { TestContext, TestStepController } from "@/services/TestContext";
import { verifyEcosystemRecognition } from "@/services/trustRegistryApi";

interface RecognitionVerificationStepProps {
    context: TestContext;
    controller: TestStepController;
    isActive: boolean;
}

export function RecognitionVerificationStep({ context, controller }: RecognitionVerificationStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [entityInput, setEntityInput] = useState(context.recognitionEntityId || context.ecosystemDID || "");
    const [authorityInput, setAuthorityInput] = useState(context.recognitionAuthorityId || "");
    const [actionInput, setActionInput] = useState(context.recognitionAction || "");
    const [resourceInput, setResourceInput] = useState(context.recognitionResource || "");
    const [contextInput, setContextInput] = useState(context.recognitionContextJson || "");
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        setEntityInput(context.recognitionEntityId || context.ecosystemDID || "");
        setAuthorityInput(context.recognitionAuthorityId || "");
        setActionInput(context.recognitionAction || "");
        setResourceInput(context.recognitionResource || "");
        setContextInput(context.recognitionContextJson || "");
    }, [context.recognitionEntityId, context.recognitionAuthorityId, context.recognitionAction, context.recognitionResource, context.recognitionContextJson, context.ecosystemDID]);

    const handleVerify = async () => {
        if (!context.apiBaseUrl) {
            const message = "No API base URL available. Resolve or provide a TRQP endpoint first.";
            controller.setError(message);
            setFormError(message);
            return;
        }

        const trimmedEntity = entityInput.trim();
        const trimmedAuthority = authorityInput.trim();
        const trimmedAction = actionInput.trim();
        const trimmedResource = resourceInput.trim();

        if (!trimmedEntity || !trimmedAuthority || !trimmedAction || !trimmedResource) {
            const message = "Please provide Entity ID, Authority ID, Action, and Resource.";
            controller.setError(message);
            setFormError(message);
            return;
        }

        controller.updateContext({
            recognitionEntityId: trimmedEntity,
            recognitionAuthorityId: trimmedAuthority,
            recognitionAction: trimmedAction,
            recognitionResource: trimmedResource,
            recognitionContextJson: contextInput
        });
        setFormError(null);
        await verifyRecognition(trimmedEntity, trimmedAuthority, trimmedAction, trimmedResource, contextInput);
    };

    const verifyRecognition = async (
        entityOverride?: string,
        authorityOverride?: string,
        actionOverride?: string,
        resourceOverride?: string,
        ctxOverride?: string
    ) => {
        const entityId = entityOverride || context.recognitionEntityId;
        const authorityId = authorityOverride || context.recognitionAuthorityId;
        const action = actionOverride || context.recognitionAction;
        const resource = resourceOverride || context.recognitionResource;
        const ctxJson = ctxOverride ?? context.recognitionContextJson;

        if (!context.apiBaseUrl || !entityId || !authorityId || !action || !resource) {
            return;
        }

        setIsLoading(true);
        controller.setStatus("running");
        controller.setError(null);

        try {
            const result = await verifyEcosystemRecognition(
                context.apiBaseUrl,
                entityId,
                authorityId,
                action,
                resource,
                ctxJson,
                ""
            );

            controller.updateContext({
                recognitionResult: result,
                reportTimestamp: new Date().toISOString()
            });

            controller.setStatus(result.recognized ? "passed" : "failed");
            controller.complete(true);
            setTimeout(() => controller.goToNextStep(), 1000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            controller.setError(errorMessage);
            setFormError(errorMessage);
            controller.setStatus("failed");
            controller.updateContext({
                errors: {
                    ...context.errors,
                    recognitionVerification: errorMessage
                }
            });
            controller.complete(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col p-4 border border-gray-300 rounded">
            <div className="mb-6">
                <h4 className="text-lg font-semibold mb-2">Recognition Inputs</h4>
                <p className="text-sm text-gray-600 mb-4">
                    Provide the full TRQP recognition payload (entity, authority, action, resource, optional context).
                </p>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="recognitionEntity" className="block text-sm font-medium text-gray-700 mb-1">
                            Entity ID
                        </label>
                        <input
                            id="recognitionEntity"
                            type="text"
                            value={entityInput}
                            onChange={(e) => setEntityInput(e.target.value)}
                            placeholder="did:web:example"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">The ecosystem asserting recognition.</p>
                    </div>

                    <div>
                        <label htmlFor="recognitionAuthority" className="block text-sm font-medium text-gray-700 mb-1">
                            Authority ID
                        </label>
                        <input
                            id="recognitionAuthority"
                            type="text"
                            value={authorityInput}
                            onChange={(e) => setAuthorityInput(e.target.value)}
                            placeholder="did:webvh:ayra.forum"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Authority DID or identifier for the recognition policy.</p>
                    </div>

                    <div>
                        <label htmlFor="recognitionAction" className="block text-sm font-medium text-gray-700 mb-1">
                            Action
                        </label>
                        <input
                            id="recognitionAction"
                            type="text"
                            value={actionInput}
                            onChange={(e) => setActionInput(e.target.value)}
                            placeholder="member-of"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Action to evaluate (e.g., recognize, member-of).</p>
                    </div>

                    <div>
                        <label htmlFor="recognitionResource" className="block text-sm font-medium text-gray-700 mb-1">
                            Resource
                        </label>
                        <input
                            id="recognitionResource"
                            type="text"
                            value={resourceInput}
                            onChange={(e) => setResourceInput(e.target.value)}
                            placeholder="ayratrustnetwork"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Recognition resource or trust network identifier being checked.</p>
                    </div>

                    <div>
                        <label htmlFor="recognitionContext" className="block text-sm font-medium text-gray-700 mb-1">
                            Context (JSON, optional)
                        </label>
                        <textarea
                            id="recognitionContext"
                            value={contextInput}
                            onChange={(e) => setContextInput(e.target.value)}
                            placeholder='{"nonce":"123"}'
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                        />
                        <p className="mt-1 text-xs text-gray-500">Additional context for the recognition check.</p>
                    </div>
                </div>

                {formError && (
                    <div className="mt-4 p-3 rounded bg-red-50 text-red-700 text-sm">
                        {formError}
                    </div>
                )}

                <div className="mt-4">
                    <button
                        onClick={handleVerify}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        disabled={isLoading}
                    >
                        Run Recognition Check
                    </button>
                </div>
            </div>

            <div className="border-t pt-4">
            {isLoading ? (
                <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                    <span className="text-gray-600">Checking recognition...</span>
                </div>
            ) : context.recognitionResult ? (
                <div className="w-full">
                    <div className="mb-4 flex items-center">
                        <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                context.recognitionResult.recognized ? "bg-green-500" : "bg-red-500"
                            } text-white mr-3`}
                        >
                            {context.recognitionResult.recognized ? "✓" : "✗"}
                        </div>
                        <div>
                            <h3
                                className={`text-lg font-semibold ${
                                    context.recognitionResult.recognized ? "text-green-700" : "text-red-700"
                                }`}
                            >
                                {context.recognitionResult.recognized ? "Recognized" : "Not Recognized"}
                            </h3>
                            <p className="text-sm text-gray-600">
                                {context.recognitionResult.recognized
                                    ? `${context.recognitionEntityId} recognizes ${context.recognitionResource}.`
                                    : `${context.recognitionEntityId} does not recognize ${context.recognitionResource}.`}
                            </p>
                        </div>
                    </div>

                    {context.recognitionResult.details && (
                        <div className="mt-4">
                            <p className="font-medium mb-2">Response Details:</p>
                            <div className="bg-gray-100 p-3 rounded overflow-auto max-h-60">
                                <pre className="text-xs">
                                    {JSON.stringify(context.recognitionResult.details, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex justify-between">
                        <button
                            onClick={handleVerify}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                        >
                            Run Again
                        </button>
                        <button
                            onClick={() => controller.goToNextStep()}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            ) : context.errors?.recognitionVerification ? (
                <div className="text-center py-4 text-red-500">
                    <p className="font-semibold">Error:</p>
                    <p>{context.errors.recognitionVerification}</p>

                    <button
                        onClick={handleVerify}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Try Again
                    </button>
                </div>
            ) : (
                <div className="text-center py-4">
                    <p className="text-gray-500 italic">
                        Configure the fields above and click &quot;Run Recognition Check&quot; to see the result here.
                    </p>
                </div>
            )}
            </div>
        </div>
    );
}
