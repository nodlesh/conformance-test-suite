import React, { useEffect, useState } from "react";
import { TestContext, TestStepController } from "@/services/TestContext";
import { resolveDID as resolveDIDService, getServiceEndpoint, getDefaultResolverUrl } from "@/services/didResolver";

interface DIDResolutionStepProps {
    context: TestContext;
    controller: TestStepController;
    isActive: boolean;
}

export function DIDResolutionStep({ context, controller }: DIDResolutionStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [ecosystemDid, setEcosystemDid] = useState(context.ecosystemDID || "");
    const [resolverUrl, setResolverUrl] = useState(context.resolverUrl || getDefaultResolverUrl());
    const [useKnownEndpoint, setUseKnownEndpoint] = useState(context.useKnownEndpoint || false);
    const [knownEndpointUrl, setKnownEndpointUrl] = useState(context.knownEndpointUrl || "");
    const localOverrideUrl = process.env.NEXT_PUBLIC_TRQP_LOCAL_URL;

    useEffect(() => {
        setEcosystemDid(context.ecosystemDID || "");
        setResolverUrl(context.resolverUrl || getDefaultResolverUrl());
        setUseKnownEndpoint(context.useKnownEndpoint || false);
        setKnownEndpointUrl(context.knownEndpointUrl || "");
    }, [context.ecosystemDID, context.resolverUrl, context.useKnownEndpoint, context.knownEndpointUrl]);

    const handleResolve = async () => {
        const trimmedDid = ecosystemDid.trim();
        const trimmedResolver = resolverUrl.trim() || getDefaultResolverUrl();
        const trimmedEndpoint = knownEndpointUrl.trim();

        if (!useKnownEndpoint && !trimmedDid) {
            const message = "Please enter an Ecosystem DID when not using a known endpoint.";
            controller.setError(message);
            setFormError(message);
            return;
        }

        if (useKnownEndpoint && !trimmedEndpoint) {
            const message = "Provide a Trust Registry endpoint or disable the bypass option.";
            controller.setError(message);
            setFormError(message);
            return;
        }

        setFormError(null);
        controller.setError(null);

        const normalizedDid = trimmedDid || context.ecosystemDID || "did:example:direct-trqp";
        controller.updateContext({
            ecosystemDID: normalizedDid,
            resolverUrl: trimmedResolver,
            useKnownEndpoint,
            knownEndpointUrl: trimmedEndpoint
        });

        await performResolution(normalizedDid, trimmedResolver, useKnownEndpoint, trimmedEndpoint);
    };

    const performResolution = async (didValue: string, resolverUrlValue: string, bypass: boolean, knownUrl: string) => {
        if (bypass && knownUrl) {
            controller.setStatus("skipped");
            controller.setError(null);

            const syntheticDocument = {
                id: didValue,
                service: [{
                    id: `${didValue}#trqp`,
                    type: "TRQP",
                    serviceEndpoint: knownUrl
                }]
            };

            controller.updateContext({
                didDocument: syntheticDocument,
                apiBaseUrl: knownUrl
            });

            controller.complete(true);
            setTimeout(() => controller.goToNextStep(), 500);
            return;
        }

        setIsLoading(true);
        controller.setStatus("running");
        controller.setError(null);

        try {
            const document = await resolveDIDService(didValue, resolverUrlValue);
            console.log("Resolved DID Document:", JSON.stringify(document, null, 2));
            if (!document) {
                throw new Error(`Failed to resolve DID using ${resolverUrlValue}`);
            }

            const hasTrqpService = document.service?.some(svc => svc.type === "TRQP") || false;
            if (!hasTrqpService) {
                throw new Error("DID document does not contain a TRQP service endpoint");
            }

            const apiBaseUrl = getServiceEndpoint(document, "TRQP");
            if (!apiBaseUrl) {
                throw new Error("Could not extract TRQP service endpoint");
            }

            controller.updateContext({
                didDocument: document,
                apiBaseUrl: localOverrideUrl || apiBaseUrl
            });

            controller.setStatus("passed");
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
                    didResolution: errorMessage
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
                <h4 className="text-lg font-semibold mb-2">TRQP Endpoint Configuration</h4>
                <p className="text-sm text-gray-600 mb-4">
                    Configure the DID and resolver you want to use. You can also bypass DID resolution by providing a known TRQP endpoint.
                </p>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="ecosystemDid" className="block text-sm font-medium text-gray-700 mb-1">
                            Ecosystem DID
                        </label>
                        <input
                            id="ecosystemDid"
                            type="text"
                            value={ecosystemDid}
                            onChange={(e) => setEcosystemDid(e.target.value)}
                            placeholder="did:example:ecosystem"
                            disabled={useKnownEndpoint}
                            className={`w-full border p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${useKnownEndpoint ? "bg-gray-100 border-gray-200 cursor-not-allowed" : "border-gray-300 bg-white"}`}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Required when resolving through a DID. Optional when using a known endpoint.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="resolverUrl" className="block text-sm font-medium text-gray-700 mb-1">
                            Universal Resolver URL
                        </label>
                        <input
                            id="resolverUrl"
                            type="text"
                            value={resolverUrl}
                            onChange={(e) => setResolverUrl(e.target.value)}
                            placeholder="https://dev.uniresolver.io/1.0/identifiers"
                            disabled={useKnownEndpoint}
                            className={`w-full border p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${useKnownEndpoint ? "bg-gray-100 border-gray-200 cursor-not-allowed" : "border-gray-300 bg-white"}`}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Change this if you use your own DID resolver. Ignored when using a known TRQP endpoint.
                        </p>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-gray-50">
                        <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                            <input
                                type="checkbox"
                                checked={useKnownEndpoint}
                                onChange={() => setUseKnownEndpoint(!useKnownEndpoint)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span>Use a known Trust Registry endpoint (skip DID resolution)</span>
                        </label>
                        <input
                            type="text"
                            value={knownEndpointUrl}
                            onChange={(e) => setKnownEndpointUrl(e.target.value)}
                            placeholder="https://sandbox-tr.ayra.network/"
                            disabled={!useKnownEndpoint}
                            className={`w-full border p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${useKnownEndpoint ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-100"}`}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Provide the TRQP base URL when bypassing DID resolution.
                        </p>
                    </div>
                </div>

                {formError && (
                    <div className="mt-4 p-3 rounded bg-red-50 text-red-700 text-sm">
                        {formError}
                    </div>
                )}

                <div className="mt-4">
                    <button
                        onClick={handleResolve}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Save &amp; Resolve
                    </button>
                </div>
            </div>

            <div className="border-t pt-4">
                {isLoading ? (
                    <div className="text-center py-4">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                        <span className="text-gray-600">Resolving {ecosystemDid || context.ecosystemDID}...</span>
                    </div>
                ) : context.didDocument ? (
                    <div className="w-full">
                        <div className="flex items-center mb-4">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                context.useKnownEndpoint ? "bg-gray-500" : "bg-green-500"
                            } text-white mr-2`}>
                                {context.useKnownEndpoint ? "–" : "✓"}
                            </div>
                            <span className="font-semibold">
                                {context.useKnownEndpoint ? "DID resolution bypassed (using provided endpoint)" : "TRQP Service Found"}
                            </span>
                        </div>

                        {!context.useKnownEndpoint && (
                            <>
                                <div className="mt-4">
                                    <p className="font-medium mb-2">DID Document:</p>
                                    <div className="bg-gray-100 p-3 rounded overflow-auto max-h-60">
                                        <pre className="text-xs">
                                            {JSON.stringify(context.didDocument, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {context.didDocument.service && (
                                    <div className="mt-4">
                                        <p className="font-medium mb-2">Services:</p>
                                        <ul className="space-y-2">
                                            {context.didDocument.service.map((svc, idx) => (
                                                <li key={idx} className="bg-gray-100 p-2 rounded">
                                                    <p><strong>Type:</strong> {svc.type}</p>
                                                    <p><strong>Endpoint:</strong> {svc.serviceEndpoint?.uri || "N/A"}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="mt-4 text-sm text-gray-600">
                            {context.useKnownEndpoint ? (
                                <p>Using provided TRQP endpoint: {context.apiBaseUrl}</p>
                            ) : (
                                <>
                                    <p>DID successfully resolved with TRQP service endpoint.</p>
                                    <p>Resolver used: {context.resolverUrl || resolverUrl}</p>
                                    <p>API endpoint: {context.apiBaseUrl}</p>
                                </>
                            )}
                        </div>
                    </div>
                ) : context.errors?.didResolution ? (
                    <div className="text-center py-4 text-red-500">
                        <p className="font-semibold">Error:</p>
                        <p>{context.errors.didResolution}</p>
                        <button
                            onClick={handleResolve}
                            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Try Again
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-4 text-gray-500">
                        <p>Enter configuration above and click &quot;Save &amp; Resolve&quot; to continue.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
