import React from "react";
import { ConformanceTestReport } from "@/services/trustRegistryApi";
import { DIDDocument } from "@/services/didResolver";

interface ConformanceReportProps {
    did: string;
    didDocument: DIDDocument | null;
    apiReport: ConformanceTestReport | null;
    authorizationResult: { authorized: boolean; details?: any } | null;
    timestamp: string;
}

export default function ConformanceReport({
    did,
    didDocument,
    apiReport,
    authorizationResult,
    timestamp
}: ConformanceReportProps) {
    const hasTrqpService = didDocument?.service?.some(svc => svc.type === "TRQP") || false;
    const apiTestsPassed = apiReport ? apiReport.failedCount === 0 : false;
    const isAuthorized = authorizationResult?.authorized || false;
    
    const getOverallStatus = () => {
        if (!didDocument || !hasTrqpService || !apiReport) {
            return "Failed";
        }
        
        if (!apiTestsPassed) {
            return "Partial";
        }
        
        if (!authorizationResult) {
            return "Incomplete";
        }
        
        return isAuthorized ? "Passed" : "Failed";
    };
    
    const getStatusColor = () => {
        const status = getOverallStatus();
        switch (status) {
            case "Passed":
                return "bg-green-100 text-green-800";
            case "Partial":
                return "bg-yellow-100 text-yellow-800";
            case "Incomplete":
                return "bg-blue-100 text-blue-800";
            case "Failed":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };
    
    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Trust Registry Conformance Report</h2>
                <div className={`px-3 py-1 rounded-full ${getStatusColor()}`}>
                    {getOverallStatus()}
                </div>
            </div>
            
            <div className="mb-6">
                <p className="text-sm text-gray-500">Generated on: {new Date(timestamp).toLocaleString()}</p>
                <p className="font-medium">Ecosystem DID: <span className="font-normal">{did}</span></p>
            </div>
            
            <div className="space-y-6">
                <div className="border rounded-md overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                        <h3 className="font-semibold">DID Resolution</h3>
                    </div>
                    <div className="p-4">
                        <div className="flex items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                didDocument ? (hasTrqpService ? 'bg-green-500' : 'bg-red-500') : 'bg-gray-400'
                            } text-white mr-2`}>
                                {didDocument ? (hasTrqpService ? '✓' : '✗') : '?'}
                            </div>
                            <span>
                                {didDocument 
                                    ? (hasTrqpService 
                                        ? "DID resolves with TRQP service" 
                                        : "DID resolves but no TRQP service found")
                                    : "DID resolution failed"}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="border rounded-md overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                        <h3 className="font-semibold">API Conformance Tests</h3>
                    </div>
                    <div className="p-4">
                        {apiReport ? (
                            <div>
                                <div className="flex items-center">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                        apiTestsPassed ? 'bg-green-500' : 'bg-yellow-500'
                                    } text-white mr-2`}>
                                        {apiTestsPassed ? '✓' : '!'}
                                    </div>
                                    <span>
                                        {apiTestsPassed 
                                            ? "All API conformance tests passed" 
                                            : "Some API conformance tests failed"}
                                    </span>
                                </div>
                                <div className="mt-2 text-sm">
                                    <p>Tests passed: {apiReport.passedCount} of {apiReport.passedCount + apiReport.failedCount}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-500 italic">API conformance tests not run</p>
                        )}
                    </div>
                </div>
                
                <div className="border rounded-md overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                        <h3 className="font-semibold">Authorization Verification</h3>
                    </div>
                    <div className="p-4">
                        {authorizationResult ? (
                            <div className="flex items-center">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    isAuthorized ? 'bg-green-500' : 'bg-red-500'
                                } text-white mr-2`}>
                                    {isAuthorized ? '✓' : '✗'}
                                </div>
                                <span>
                                    {isAuthorized 
                                        ? "Entity is authorized for the specified action" 
                                        : "Entity is not authorized for the specified action"}
                                </span>
                            </div>
                        ) : (
                            <p className="text-gray-500 italic">Authorization verification not run</p>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="mt-8 text-gray-600 text-sm">
                <p>This report shows the conformance of the specified Trust Registry to the Ayra Trust Registry Ecosystem requirements.</p>
            </div>
        </div>
    );
}
