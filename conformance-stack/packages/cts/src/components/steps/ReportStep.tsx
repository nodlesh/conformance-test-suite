import React from "react";
import { DetailedReport } from "@/components/common/DetailedReport";
import { TestContext, TestStepController } from "@/services/TestContext";

interface ReportStepProps {
    context: TestContext;
    controller: TestStepController;
    isActive: boolean;
    onRestart: () => void;
}

export function ReportStep({ context, controller, isActive, onRestart }: ReportStepProps) {
    const stringifyDetails = React.useCallback((value: unknown) => {
        if (value === undefined || value === null) {
            return null;
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }, []);

    const reportData = React.useMemo(() => {
        const hasTrqpService =
            context.didDocument?.service?.some((svc) => svc.type === "TRQP") || false;
        const generatedAt = context.reportTimestamp || new Date().toISOString();

        const createNode = ({
            id,
            name,
            description,
            status,
            runState,
            finished,
            messages,
            warnings = [],
            errors = [],
        }: {
            id: string;
            name: string;
            description: string;
            status: string;
            runState: string;
            finished: boolean;
            messages: string[];
            warnings?: string[];
            errors?: string[];
        }) => ({
            id,
            name,
            description,
            state: runState,
            finished,
            task: {
                state: {
                    status,
                    runState,
                    messages,
                    warnings,
                    errors,
                },
            },
        });

        const didResolutionMessages = [
            context.ecosystemDID ? `Ecosystem DID: ${context.ecosystemDID}` : null,
            context.useKnownEndpoint
                ? `Known TRQP endpoint: ${context.apiBaseUrl || context.knownEndpointUrl || "not provided"}`
                : null,
            !context.useKnownEndpoint && context.resolverUrl
                ? `Resolver URL: ${context.resolverUrl}`
                : null,
            !context.useKnownEndpoint && context.apiBaseUrl
                ? `Resolved TRQP endpoint: ${context.apiBaseUrl}`
                : null,
            context.didDocument && !context.useKnownEndpoint && hasTrqpService
                ? "DID document contains a TRQP service endpoint."
                : null,
        ].filter((message): message is string => Boolean(message));

        const didResolutionErrors = [
            context.errors?.didResolution || null,
        ].filter((message): message is string => Boolean(message));

        const didResolutionStatus = context.didDocument && (context.useKnownEndpoint || hasTrqpService)
            ? {
                status: context.useKnownEndpoint ? "Completed" : "Accepted",
                runState: "completed",
                finished: true,
            }
            : didResolutionErrors.length > 0
                ? { status: "Failed", runState: "failed", finished: true }
                : { status: "Waiting", runState: "waiting", finished: false };

        const apiPassedCount = context.apiTestReport?.passedCount || 0;
        const apiFailedCount = context.apiTestReport?.failedCount || 0;
        const apiTotalCount = apiPassedCount + apiFailedCount;
        const apiMessages = [
            context.apiBaseUrl ? `TRQP base URL: ${context.apiBaseUrl}` : null,
            context.apiTestReport
                ? `Passed ${apiPassedCount} of ${apiTotalCount} API conformance checks.`
                : null,
            ...(context.apiTestReport?.testResults
                .filter((result) => result.status === "passed")
                .map((result) =>
                    `${result.name}: passed${result.details ? ` (${result.details})` : ""}`
                ) || []),
        ].filter((message): message is string => Boolean(message));
        const apiErrors = [
            context.errors?.apiTest || null,
            ...(context.apiTestReport?.testResults
                .filter((result) => result.status === "failed")
                .map((result) =>
                    `${result.name}: ${result.details || "failed"}`
                ) || []),
        ].filter((message): message is string => Boolean(message));
        const apiStatus = context.apiTestReport
            ? apiFailedCount === 0
                ? { status: "Accepted", runState: "completed", finished: true }
                : { status: "Failed", runState: "failed", finished: true }
            : context.errors?.apiTest
                ? { status: "Failed", runState: "failed", finished: true }
                : { status: "Waiting", runState: "waiting", finished: false };

        const authDetails = stringifyDetails(context.authResult?.details);
        const authMessages = [
            context.entityId ? `Entity ID: ${context.entityId}` : null,
            context.authorityId ? `Authority ID: ${context.authorityId}` : null,
            context.action ? `Action: ${context.action}` : null,
            context.resource ? `Resource: ${context.resource}` : null,
            context.authResult
                ? `Authorization result: ${context.authResult.authorized ? "authorized" : "not authorized"}`
                : null,
            authDetails ? `Authorization response: ${authDetails}` : null,
        ].filter((message): message is string => Boolean(message));
        const authErrors = [
            context.errors?.authVerification || null,
            context.authResult && !context.authResult.authorized
                ? "TRQP authorization check returned unauthorized."
                : null,
        ].filter((message): message is string => Boolean(message));
        const authStatus = context.authResult
            ? context.authResult.authorized
                ? { status: "Accepted", runState: "completed", finished: true }
                : { status: "Failed", runState: "failed", finished: true }
            : context.errors?.authVerification
                ? { status: "Failed", runState: "failed", finished: true }
                : { status: "Waiting", runState: "waiting", finished: false };

        const recognitionDetails = stringifyDetails(context.recognitionResult?.details);
        const recognitionMessages = [
            context.recognitionEntityId
                ? `Entity ID: ${context.recognitionEntityId}`
                : context.ecosystemDID
                    ? `Entity ID: ${context.ecosystemDID}`
                    : null,
            context.recognitionAuthorityId
                ? `Authority ID: ${context.recognitionAuthorityId}`
                : null,
            context.recognitionAction ? `Action: ${context.recognitionAction}` : null,
            context.recognitionResource ? `Resource: ${context.recognitionResource}` : null,
            context.recognitionResult
                ? `Recognition result: ${context.recognitionResult.recognized ? "recognized" : "not recognized"}`
                : null,
            recognitionDetails ? `Recognition response: ${recognitionDetails}` : null,
        ].filter((message): message is string => Boolean(message));
        const recognitionErrors = [
            context.errors?.recognitionVerification || null,
            context.recognitionResult && !context.recognitionResult.recognized
                ? "TRQP recognition check returned not recognized."
                : null,
        ].filter((message): message is string => Boolean(message));
        const recognitionStatus = context.recognitionResult
            ? context.recognitionResult.recognized
                ? { status: "Accepted", runState: "completed", finished: true }
                : { status: "Failed", runState: "failed", finished: true }
            : context.errors?.recognitionVerification
                ? { status: "Failed", runState: "failed", finished: true }
                : { status: "Waiting", runState: "waiting", finished: false };

        const nodes = [
            createNode({
                id: "did-resolution",
                name: "Resolve DID",
                description: "Configure the ecosystem DID and TRQP endpoint, then resolve it.",
                messages: didResolutionMessages,
                errors: didResolutionErrors,
                ...didResolutionStatus,
            }),
            createNode({
                id: "api-conformance",
                name: "Ayra Extension API Tests",
                description: "Exercise the additional Ayra APIs for metadata, lookups, and recognitions.",
                messages: apiMessages,
                errors: apiErrors,
                ...apiStatus,
            }),
            createNode({
                id: "authorization-verification",
                name: "Authorization Verification",
                description: "Provide an entity and authorization, then verify the TRQP authorization response.",
                messages: authMessages,
                errors: authErrors,
                ...authStatus,
            }),
            createNode({
                id: "recognition-verification",
                name: "Recognition Verification",
                description: "Check whether one ecosystem recognizes another via TRQP.",
                messages: recognitionMessages,
                errors: recognitionErrors,
                ...recognitionStatus,
            }),
            createNode({
                id: "report",
                name: "Report",
                description: "Review the test results and export the JSON report.",
                status: "Completed",
                runState: "completed",
                finished: true,
                messages: [`Generated on ${new Date(generatedAt).toLocaleString()}`],
            }),
        ];

        const hasFailures = nodes.some((node) => node.task.state.status === "Failed");
        const allFinished = nodes.every((node) =>
            node.task.state.status === "Accepted" || node.task.state.status === "Completed"
        );

        return {
            status: hasFailures
                ? { status: "Failed", runState: "failed" }
                : allFinished
                    ? { status: "Completed", runState: "completed" }
                    : { status: "Running", runState: "running" },
            metadata: {
                name: "Trust Registry Conformance Test",
                id: `trust-registry-${generatedAt}`,
            },
            nodes,
        };
    }, [context, stringifyDetails]);

    // Mark step as passed when active
    React.useEffect(() => {
        if (isActive) {
            controller.setStatus("passed");
            controller.complete(true);
        }
    }, [isActive, controller]);

    if (!isActive) {
        return null;
    }

    return (
        <DetailedReport
            dagData={reportData}
            testType="Trust Registry"
            onRestart={onRestart}
        />
    );
}
