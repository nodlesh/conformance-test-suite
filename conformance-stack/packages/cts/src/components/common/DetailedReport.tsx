"use client";

import React, { useState } from "react";

// Types
interface DAGData {
  status: {
    status: string;
    runState: string;
  };
  metadata: {
    name: string;
    id: string;
  };
  nodes: TaskNode[];
}

interface TaskNode {
  id: string;
  name: string;
  description?: string;
  state: string;
  finished: boolean;
  task: {
    state: {
      status: string;
      runState: string;
      messages: string[];
      warnings: string[];
      errors: string[];
    };
  };
}

interface ConformanceReport {
  testType: string;
  status: string;
  timestamp: string;
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    successRate: string;
  };
  details?: any;
  stepResults?: any;
  failureDetails?: {
    failedStep: string;
    errorMessage: string;
    errorType: string;
    timestamp: string;
  };
  conformanceLevel: string;
  recommendations: string[];
}

interface DetailedReportProps {
  dagData?: DAGData;
  testType: string;
  onRestart: () => void;
  className?: string;
}

export function DetailedReport({ 
  dagData, 
  testType, 
  onRestart,
  className = "" 
}: DetailedReportProps) {
  const [showFullReport, setShowFullReport] = useState(false);
  const isVerifierReport = testType.toLowerCase().includes("verifier");
  const exportFileNameBase =
    testType
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "test";

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
      case 'completed':
      case 'passed':
        return 'text-green-600';
      case 'failed':
      case 'error':
        return 'text-red-600';
      case 'running':
      case 'started':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
      case 'completed':
      case 'passed':
        return (
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        );
      case 'failed':
      case 'error':
        return (
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        );
      case 'running':
      case 'started':
        return (
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
        );
      default:
        return (
          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
        );
    }
  };

  const getOverallStatus = () => {
    if (!dagData?.nodes) return 'unknown';
    
    const hasFailures = dagData.nodes.some(node => 
      node.task.state.status === 'Failed' || 
      node.task.state.status === 'Error'
    );
    
    if (hasFailures) return 'failed';
    
    const allCompleted = dagData.nodes.every(node => 
      node.task.state.status === 'Accepted' || 
      node.task.state.status === 'Completed'
    );
    
    if (allCompleted) return 'passed';
    
    return 'running';
  };

  const extractConformanceReport = (): ConformanceReport | null => {
    if (!dagData?.nodes) return null;
    
    // Look for a task result that contains a report (specifically the evaluation task)
    for (const node of dagData.nodes) {
      // Check if this is an evaluation task with a report
      if (node.name.toLowerCase().includes('evaluat') || 
          node.name.toLowerCase().includes('report')) {
        // Try to extract the report from task results if available
        // This would require access to task.results(), but in the frontend
        // we might need to get this data differently
        
        // For now, check if the node has any conformance report data
        // This might be passed through the DAG serialization
        if ((node as any).report) {
          return (node as any).report;
        }
        break;
      }
    }
    
    // If no specific report found, construct a basic report from DAG data
    const overallStatus = getOverallStatus();
    const completedSteps = dagData.nodes.filter(n => 
      n.task.state.status === 'Accepted' || 
      n.task.state.status === 'Completed'
    ).length;
    
    const failedSteps = dagData.nodes.filter(n => 
      n.task.state.status === 'Failed' || 
      n.task.state.status === 'Error'
    ).length;
    
    // Enhanced report construction for verifier test
    const stepResults: any = {};
    const stepNames = [
      'selfIssuance',
      'connectionEstablishment', 
      'dataIntegration',
      'presentationProposal',
      'verificationProcess',
      'evaluation'
    ];
    
    dagData.nodes.forEach((node, index) => {
      const stepKey = stepNames[index] || `step${index + 1}`;
      const nodeStatus = node.task.state.status;
      
      stepResults[stepKey] = {
        status: nodeStatus === 'Accepted' || nodeStatus === 'Completed' ? 'Pass' :
                nodeStatus === 'Failed' || nodeStatus === 'Error' ? 'Fail' : 'Pending',
        description: node.description || node.name,
        messages: node.task.state.messages || [],
        errors: node.task.state.errors || []
      };
    });
    
    const defaultRecommendations =
      overallStatus === 'passed'
        ? [
            `${testType} demonstrates full compliance with required protocols`,
            'All test steps completed successfully',
            'Proper connection and proof exchange protocols followed',
          ]
        : [
            `Review failed steps and address identified issues`,
            'Check agent logs for detailed error information',
            'Ensure all required dependencies are properly configured',
          ];

    const recommendations = defaultRecommendations;

    return {
      testType: testType,
      status: overallStatus.toUpperCase(),
      timestamp: new Date().toISOString(),
      summary: {
        totalSteps: dagData.nodes.length,
        completedSteps: completedSteps,
        failedSteps: failedSteps,
        successRate: `${Math.round((completedSteps / dagData.nodes.length) * 100)}%`
      },
      stepResults: stepResults,
      conformanceLevel: overallStatus === 'passed' ? 'Full' : 
                       overallStatus === 'failed' ? 'Failed' : 'Partial',
      recommendations
    };
  };

  const conformanceReport = extractConformanceReport();

  if (!dagData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Test Report</h4>
          <p className="text-gray-800 text-sm">
            No test data available. Please run a test to see the results.
          </p>
        </div>
        
        <div className="text-center">
          <button onClick={onRestart} className="btn btn-blue">
            Start New Test
          </button>
        </div>
      </div>
    );
  }

  const overallStatus = getOverallStatus();
  const formatVerifierNode = (node: TaskNode) => {
    if (!isVerifierReport) {
      return { name: node.name, description: node.description };
    }
    const lower = node.name.toLowerCase();
    const runSuffixMatch = node.name.match(/\(run\s+\d+\)/i);
    const runSuffix = runSuffixMatch ? ` ${runSuffixMatch[0]}` : "";
    if (lower.includes("wait for verification")) {
      return {
        name: `Await Verifier Response${runSuffix}`,
        description:
          "Wait for an ack or problem report from the verifier.",
      };
    }
    if (lower.includes("evaluate trqp enforcement")) {
      return {
        name: "Evaluate TRQP Evidence",
        description:
          "Compare run 1 vs run 2 outcomes using observable protocol evidence and TRQP admin changes.",
      };
    }
    if (lower.includes("prepare trqp enforcement")) {
      return {
        name: "Prepare TRQP Evidence",
        description: "Resolve TRQP endpoint and verify issuer authorization via trust registry admin APIs.",
      };
    }
    return { name: node.name, description: node.description };
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Status Header */}
      <div className={`border rounded-lg p-4 ${
        overallStatus === 'passed' ? 'bg-green-50 border-green-200' :
        overallStatus === 'failed' ? 'bg-red-50 border-red-200' :
        'bg-blue-50 border-blue-200'
      }`}>
        <h4 className={`font-semibold mb-2 ${
          overallStatus === 'passed' ? 'text-green-900' :
          overallStatus === 'failed' ? 'text-red-900' :
          'text-blue-900'
        }`}>
          {overallStatus === 'passed' ? `${testType} Test Complete!` :
           overallStatus === 'failed' ? `${testType} Test Failed` :
           `${testType} Test Running...`}
        </h4>
        <p className={`text-sm ${
          overallStatus === 'passed' ? 'text-green-800' :
          overallStatus === 'failed' ? 'text-red-800' :
          'text-blue-800'
        }`}>
          {overallStatus === 'passed' ? 
            `Your ${testType.toLowerCase()} has successfully completed the conformance test.` :
           overallStatus === 'failed' ?
            `The ${testType.toLowerCase()} test encountered errors during execution.` :
            `The ${testType.toLowerCase()} test is currently in progress.`}
        </p>
      </div>

      
      {/* Summary Cards */}
      {conformanceReport && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(overallStatus)}
              <span className="font-medium">Overall Status</span>
            </div>
            <p className={`text-sm font-medium ${getStatusColor(overallStatus)}`}>
              {conformanceReport.status}
            </p>
          </div>
          
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="font-medium">Success Rate</span>
            </div>
            <p className="text-sm text-gray-600">{conformanceReport.summary.successRate}</p>
          </div>
          
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="font-medium">Conformance</span>
            </div>
            <p className="text-sm text-gray-600">{conformanceReport.conformanceLevel}</p>
          </div>
        </div>
      )}

      {/* Detailed Report */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h5 className="font-semibold text-lg">Detailed Test Report</h5>
          <button
            onClick={() => setShowFullReport(!showFullReport)}
            className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
          >
            {showFullReport ? 'Hide Details' : 'Show Full Report'}
          </button>
        </div>
        
        {/* Basic Report */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="font-medium">Test Name:</span>
            <span>{dagData.metadata.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Test Type:</span>
            <span>{testType}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Overall Status:</span>
            <span className={`font-medium ${getStatusColor(dagData.status.status)}`}>
              {dagData.status.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Run State:</span>
            <span className={`font-medium ${getStatusColor(dagData.status.runState)}`}>
              {dagData.status.runState}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Total Tasks:</span>
            <span>{dagData.nodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Completed Tasks:</span>
            <span>{dagData.nodes.filter(n => n.finished).length}</span>
          </div>
          {conformanceReport && (
            <>
              <div className="flex justify-between">
                <span className="font-medium">Success Rate:</span>
                <span>{conformanceReport.summary.successRate}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Conformance Level:</span>
                <span className={getStatusColor(conformanceReport.conformanceLevel)}>
                  {conformanceReport.conformanceLevel}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Full Report */}
        {showFullReport && (
          <div className="mt-6 border-t pt-4">
            <h6 className="font-medium mb-3">Task Details</h6>
            <div className="space-y-4">
              {dagData.nodes.map((node, index) => {
                const formattedNode = formatVerifierNode(node);
                return (
                <div key={node.id} className="border rounded p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(node.task.state.status)}
                      <h6 className="font-medium">{formattedNode.name}</h6>
                    </div>
                    <span className={`text-sm ${getStatusColor(node.task.state.status)}`}>
                      {node.task.state.status}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p><strong>Description:</strong> {formattedNode.description || 'No description'}</p>
                    <p><strong>State:</strong> {node.state}</p>
                    <p><strong>Run State:</strong> {node.task.state.runState}</p>
                    <p><strong>Finished:</strong> {node.finished ? 'Yes' : 'No'}</p>
                    
                    {node.task.state.messages.length > 0 && (
                      <div>
                        <strong>Messages:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1 max-h-32 overflow-y-auto">
                          {node.task.state.messages.map((msg, idx) => (
                            <li key={idx} className="text-gray-600 text-xs">{msg}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {node.task.state.warnings.length > 0 && (
                      <div>
                        <strong className="text-yellow-600">Warnings:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {node.task.state.warnings.map((warn, idx) => (
                            <li key={idx} className="text-yellow-600 text-xs">{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {node.task.state.errors.length > 0 && (
                      <div>
                        <strong className="text-red-600">Errors:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {node.task.state.errors.map((err, idx) => (
                            <li key={idx} className="text-red-600 text-xs">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
            
            {/* Recommendations */}
            {conformanceReport && conformanceReport.recommendations.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h6 className="font-medium mb-3">Recommendations</h6>
                <ul className="space-y-2">
                  {conformanceReport.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span className="text-sm text-gray-700">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Export Report */}
            <div className="mt-6 pt-4 border-t">
              <button
                onClick={() => {
                  const reportData = {
                    testName: dagData.metadata.name,
                    testType: testType,
                    testId: dagData.metadata.id,
                    timestamp: new Date().toISOString(),
                    overallStatus: dagData.status,
                    conformanceReport: conformanceReport,
                    tasks: dagData.nodes.map(node => ({
                      name: node.name,
                      description: node.description,
                      status: node.task.state.status,
                      runState: node.task.state.runState,
                      finished: node.finished,
                      messages: node.task.state.messages,
                      warnings: node.task.state.warnings,
                      errors: node.task.state.errors
                    }))
                  };
                  
                  const blob = new Blob([JSON.stringify(reportData, null, 2)], {
                    type: 'application/json'
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${exportFileNameBase}-test-report-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Export Report as JSON
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center">
        <button onClick={onRestart} className="btn btn-blue">
          Run Another Test
        </button>
      </div>
    </div>
  );
}
