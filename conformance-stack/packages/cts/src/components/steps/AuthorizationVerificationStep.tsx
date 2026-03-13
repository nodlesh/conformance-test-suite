import React, { useState, useEffect } from "react";
import { TestContext, TestStepController } from "@/services/TestContext";
import { verifyEntityAuthorization } from "@/services/trustRegistryApi";

interface AuthorizationVerificationStepProps {
    context: TestContext;
    controller: TestStepController;
    isActive: boolean;
}

export function AuthorizationVerificationStep({ context, controller }: AuthorizationVerificationStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [entityInput, setEntityInput] = useState(context.entityId || "");
    const [authorityInput, setAuthorityInput] = useState(context.authorityId || "");
    const [actionInput, setActionInput] = useState(context.action || "");
    const [resourceInput, setResourceInput] = useState(context.resource || "");
    const [contextInput, setContextInput] = useState(context.authContextJson || "");
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        setEntityInput(context.entityId || "");
        setAuthorityInput(context.authorityId || "");
        setActionInput(context.action || "");
        setResourceInput(context.resource || "");
        setContextInput(context.authContextJson || "");
    }, [context.entityId, context.authorityId, context.action, context.resource, context.authContextJson]);

    const handleVerify = async () => {
        if (!context.apiBaseUrl) {
            const message = "No API base URL available. Resolve a DID or provide a TRQP endpoint first.";
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
            entityId: trimmedEntity,
            authorityId: trimmedAuthority,
            action: trimmedAction,
            resource: trimmedResource,
            authContextJson: contextInput
        });
        setFormError(null);
        await verifyAuthorization(trimmedEntity, trimmedAuthority, trimmedAction, trimmedResource, contextInput);
    };

    const verifyAuthorization = async (
        entityOverride?: string,
        authorityOverride?: string,
        actionOverride?: string,
        resourceOverride?: string,
        ctxOverride?: string
    ) => {
        const entityId = entityOverride || context.entityId;
        const authorityId = authorityOverride || context.authorityId;
        const action = actionOverride || context.action;
        const resource = resourceOverride || context.resource;
        const ctxJson = ctxOverride ?? context.authContextJson;

        if (!context.apiBaseUrl || !entityId || !authorityId || !action || !resource) {
            return;
        }

        setIsLoading(true);
        controller.setStatus("running");
        controller.setError(null);

        try {
            const result = await verifyEntityAuthorization(
                context.apiBaseUrl,
                entityId,
                authorityId,
                action,
                resource,
                ctxJson,
                ""
            );

            controller.updateContext({
                authResult: result,
                reportTimestamp: new Date().toISOString()
            });

            controller.setStatus(result.authorized ? "passed" : "failed");
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
                    authVerification: errorMessage
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
                <h4 className="text-lg font-semibold mb-2">Authorization Inputs</h4>
                <p className="text-sm text-gray-600 mb-4">
                    Provide the TRQP authorization payload values, then run the verification.
                </p>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="authEntityId" className="block text-sm font-medium text-gray-700 mb-1">
                            Entity ID
                        </label>
                        <input
                            id="authEntityId"
                            type="text"
                            value={entityInput}
                            onChange={(e) => setEntityInput(e.target.value)}
                            placeholder="did:web:ayra-cts-issuer.ngrok.app:issuer"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Entity DID or identifier being checked for authorization.</p>
                    </div>

                    <div>
                        <label htmlFor="authorizationId" className="block text-sm font-medium text-gray-700 mb-1">
                            Authority ID
                        </label>
                        <input
                            id="authorityId"
                            type="text"
                            value={authorityInput}
                            onChange={(e) => setAuthorityInput(e.target.value)}
                            placeholder="did:web:sandbox.ayra.network"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Authority DID or identifier that defines the authorization policy.</p>
                    </div>

                    <div>
                        <label htmlFor="actionId" className="block text-sm font-medium text-gray-700 mb-1">
                            Action
                        </label>
                        <input
                            id="actionId"
                            type="text"
                            value={actionInput}
                            onChange={(e) => setActionInput(e.target.value)}
                            placeholder="issue"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">TRQP action to verify, e.g., issue, manage-issuers.</p>
                    </div>

                    <div>
                        <label htmlFor="resourceId" className="block text-sm font-medium text-gray-700 mb-1">
                            Resource
                        </label>
                        <input
                            id="resourceId"
                            type="text"
                            value={resourceInput}
                            onChange={(e) => setResourceInput(e.target.value)}
                            placeholder="ayracard:businesscard"
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">Target resource (e.g., credential type) for the action.</p>
                    </div>

                    <div>
                        <label htmlFor="authContext" className="block text-sm font-medium text-gray-700 mb-1">
                            Context (JSON, optional)
                        </label>
                        <textarea
                            id="authContext"
                            value={contextInput}
                            onChange={(e) => setContextInput(e.target.value)}
                            placeholder='{"nonce":"123"}'
                            className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                        />
                        <p className="mt-1 text-xs text-gray-500">Additional context for the authorization check.</p>
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
                        Run Authorization Check
                    </button>
                </div>
            </div>

            <div className="border-t pt-4">
            {isLoading ? (
                <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                    <span className="text-gray-600">Verifying authorization...</span>
                </div>
            ) : context.authResult ? (
                <div className="w-full">
                    <div className="mb-4 flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            context.authResult.authorized ? 'bg-green-500' : 'bg-red-500'
                        } text-white mr-3`}>
                            {context.authResult.authorized ? '✓' : '✗'}
                        </div>
                        <div>
                            <h3 className={`text-lg font-semibold ${
                                context.authResult.authorized ? 'text-green-700' : 'text-red-700'
                            }`}>
                                {context.authResult.authorized ? 'Authorized' : 'Not Authorized'}
                            </h3>
                            <p className="text-sm text-gray-600">
                                {context.authResult.authorized 
                                    ? `${context.entityId} is authorized for ${context.action} on ${context.resource}`
                                    : `${context.entityId} is not authorized for ${context.action} on ${context.resource}`}
                            </p>
                        </div>
                    </div>
                    
                    {context.authResult.details && (
                        <div className="mt-4">
                            <p className="font-medium mb-2">Response Details:</p>
                            <div className="bg-gray-100 p-3 rounded overflow-auto max-h-60">
                                <pre className="text-xs">
                                    {JSON.stringify(context.authResult.details, null, 2)}
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
            ) : context.errors?.authVerification ? (
                <div className="text-center py-4 text-red-500">
                    <p className="font-semibold">Error:</p>
                    <p>{context.errors.authVerification}</p>
                    
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
                        Configure the fields above and click &quot;Run Authorization Check&quot; to see the result here.
                    </p>
                </div>
            )}
            </div>
        </div>
    );
}
