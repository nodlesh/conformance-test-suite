"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { TestRunner, TestStep, TestStepStatus } from "@/components/TestRunner";
import { TaskNode } from "@/types/DAGNode";
import { DetailedReport } from "@/components/common/DetailedReport";
import { useSocket } from "@/providers/SocketProvider";
import { RootState } from "@/store";
import { startTest, resetTest, addMessage } from "@/store/testSlice";
import { clearDAG } from "@/store/dagSlice";

// Types matching your existing backend
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

// Generalized Message Renderer Component
function MessageRenderer({ 
  messages, 
  title = "Step Log",
  className = "" 
}: { 
  messages: string[];
  title?: string;
  className?: string;
}) {
  if (messages.length === 0) return null;

  return (
    <div className={`mt-4 bg-gray-50 rounded-lg border border-gray-200 p-4 ${className}`}>
      <h5 className="font-medium text-gray-700 mb-2">{title}</h5>
      <div className="space-y-1">
        {messages.map((message, index) => (
          <div key={index} className="text-sm text-gray-600 flex items-start">
            <span className="text-gray-400 mr-2">•</span>
            <span>{message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Enhanced Task Details Component
function TaskDetailsRenderer({ 
  taskData,
  showButton = true,
  buttonText = "Show Details",
  buttonClassName = "px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
}: {
  taskData?: TaskNode;
  showButton?: boolean;
  buttonText?: string;
  buttonClassName?: string;
}) {
  const [showTaskDetails, setShowTaskDetails] = useState(false);

  if (!taskData) return null;

  return (
    <>
      {showButton && (
        <button
          onClick={() => setShowTaskDetails(!showTaskDetails)}
          className={buttonClassName}
        >
          {showTaskDetails ? 'Hide Details' : buttonText}
        </button>
      )}
      
      {showTaskDetails && (
        <div className="mt-4 p-3 bg-white rounded border">
          <h5 className="font-medium mb-2">Task Details</h5>
          <div className="text-sm space-y-1">
            <p><strong>Status:</strong> {taskData.task.state.status}</p>
            <p><strong>Run State:</strong> {taskData.task.state.runState}</p>
            <p><strong>Finished:</strong> {taskData.finished ? 'Yes' : 'No'}</p>
            {taskData.task.state.messages.length > 0 && (
              <div>
                <strong>Messages:</strong>
                <ul className="list-disc list-inside ml-2 mt-1">
                  {taskData.task.state.messages.map((msg, idx) => (
                    <li key={idx} className="text-gray-600">{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            {taskData.task.state.warnings.length > 0 && (
              <div>
                <strong className="text-yellow-600">Warnings:</strong>
                <ul className="list-disc list-inside ml-2 mt-1">
                  {taskData.task.state.warnings.map((warn, idx) => (
                    <li key={idx} className="text-yellow-600">{warn}</li>
                  ))}
                </ul>
              </div>
            )}
            {taskData.task.state.errors.length > 0 && (
              <div>
                <strong className="text-red-600">Errors:</strong>
                <ul className="list-disc list-inside ml-2 mt-1">
                  {taskData.task.state.errors.map((err, idx) => (
                    <li key={idx} className="text-red-600">{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5005";
const TRQP_SUGGEST_HELPER_ENABLED =
  (process.env.NEXT_PUBLIC_TRQP_SUGGEST_FROM_TR_ENABLED || "").toLowerCase() === "true";
type TrqpMode = "authorization" | "recognition" | "both";
type TrqpPolicyProfileInput = {
  authorization: {
    action: string;
    resource: string;
  };
  recognition: {
    action: string;
    resource: string;
    capability: string;
  };
};
type TrqpPolicyProfilePatch = {
  authorization?: Partial<TrqpPolicyProfileInput["authorization"]>;
  recognition?: Partial<TrqpPolicyProfileInput["recognition"]>;
};

const cloneTrqpProfile = (profile: TrqpPolicyProfileInput): TrqpPolicyProfileInput => ({
  authorization: { ...profile.authorization },
  recognition: { ...profile.recognition },
});

const buildTrqpPolicyProfile = (input: TrqpPolicyProfileInput) => {
  const authAction = input.authorization.action.trim();
  const authResource = input.authorization.resource.trim();
  const recAction = input.recognition.action.trim();
  const recResource = input.recognition.resource.trim();
  const recCapability = input.recognition.capability.trim();
  const profile: any = {};
  if (authAction || authResource) {
    profile.authorization = {};
    if (authAction) profile.authorization.action = authAction;
    if (authResource) profile.authorization.resource = authResource;
  }
  if (recAction || recResource || recCapability) {
    profile.recognition = {};
    if (recAction) profile.recognition.action = recAction;
    if (recResource) profile.recognition.resource = recResource;
    if (recCapability) profile.recognition.capability = recCapability;
  }
  return Object.keys(profile).length > 0 ? profile : undefined;
};

const trqpModeLabel = (mode: TrqpMode): string => {
  if (mode === "authorization") return "authorization";
  if (mode === "recognition") return "recognition";
  return "authorization + recognition";
};

function ConnectionStep({ 
  context, 
  isActive, 
  onNext,
  taskData,
  verifyTRQP,
  onToggleTRQP,
  trqpMode,
  onTrqpModeChange,
  trqpPolicyProfile,
  onTrqpPolicyProfileChange
}: { 
  context: any; 
  isActive: boolean; 
  onNext: () => void;
  taskData?: TaskNode;
  verifyTRQP: boolean;
  onToggleTRQP: (value: boolean) => void;
  trqpMode: TrqpMode;
  onTrqpModeChange: (value: TrqpMode) => void;
  trqpPolicyProfile: TrqpPolicyProfileInput;
  onTrqpPolicyProfileChange: (patch: TrqpPolicyProfilePatch) => void;
}) {
  const dispatch = useDispatch();
  const { socket, isConnected } = useSocket();
  const { invitationUrl, messages } = useSelector((state: RootState) => state.test);
  const [hasStarted, setHasStarted] = useState(false);
  const hasInitializedPipelineRef = useRef(false);
  const [isSuggestingPolicy, setIsSuggestingPolicy] = useState(false);
  const [suggestionSnapshot, setSuggestionSnapshot] = useState<TrqpPolicyProfileInput | null>(null);
  const [suggestionInfo, setSuggestionInfo] = useState<string>("");
  const [suggestionError, setSuggestionError] = useState<string>("");
  const [showAdvancedOverrides, setShowAdvancedOverrides] = useState(false);
  
  // Get messages for this step (step 0)
  const stepMessages = messages[0] || [];

  useEffect(() => {
    if (!socket || !isConnected || hasInitializedPipelineRef.current) {
      return;
    }

    const prepareHolderPipeline = async () => {
      try {
        const baseUrl = API_BASE_URL;
        const selectUrl = `${baseUrl}/api/select/pipeline?pipeline=HOLDER_TEST`;
        const response = await fetch(selectUrl);
        if (!response.ok) {
          throw new Error(`Failed to prepare holder pipeline: ${response.statusText}`);
        }
        dispatch(resetTest());
        dispatch(clearDAG());
        hasInitializedPipelineRef.current = true;
        console.log('Holder pipeline prepared');
      } catch (error) {
        hasInitializedPipelineRef.current = false;
        console.error('Error preparing holder pipeline:', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to prepare holder pipeline.';
        dispatch(addMessage({ stepIndex: 0, message: `Error: ${message}` }));
      }
    };

    prepareHolderPipeline();
  }, [socket, isConnected, dispatch]);

  useEffect(() => {
    // No longer need to handle socket events here since they're handled in SocketProvider
    // This component now just reacts to Redux state changes
  }, []);

  useEffect(() => {
    if (!verifyTRQP) {
      setSuggestionSnapshot(null);
      setSuggestionInfo("");
      setSuggestionError("");
      setShowAdvancedOverrides(false);
    }
  }, [verifyTRQP]);

  const startConnection = async (
    verifyTRQP: boolean,
    trqpMode: TrqpMode,
    trqpPolicyProfile: TrqpPolicyProfileInput
  ) => {
    if (!socket || !isConnected) {
      console.error('Not connected to server. Please refresh and try again.');
      return;
    }

    setHasStarted(true);
    dispatch(addMessage({ stepIndex: 0, message: 'Starting connection setup...' }));
    dispatch(startTest()); // Start the test in Redux
    
    try {
      const baseUrl = API_BASE_URL;
      const selectUrl = `${baseUrl}/api/select/pipeline?pipeline=HOLDER_TEST`;
      const pipelineResponse = await fetch(selectUrl);
      if (!pipelineResponse.ok) {
        throw new Error(`Failed to select pipeline: ${pipelineResponse.statusText}`);
      }
      console.log('Holder pipeline selected');
      dispatch(addMessage({ stepIndex: 0, message: 'Holder pipeline selected' }));
      
      // Small delay to ensure pipeline is selected
      setTimeout(async () => {
        try {
          const runUrl = `${baseUrl}/api/run`;
          // Start the pipeline execution
          const response = await fetch(runUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pipelineType: "HOLDER_TEST",
              verifyTRQP,
              trqpMode,
              trqpPolicyProfile: verifyTRQP ? buildTrqpPolicyProfile(trqpPolicyProfile) : undefined,
            }),
          });
          if (!response.ok) {
            throw new Error(`Failed to start pipeline: ${response.statusText}`);
          }
          console.log('Pipeline started');
          dispatch(addMessage({ stepIndex: 0, message: 'Pipeline started' }));
        } catch (innerError) {
          console.error('Error starting holder pipeline run:', innerError);
          const message =
            innerError instanceof Error
              ? innerError.message
              : 'Failed to start holder pipeline.';
          dispatch(addMessage({ stepIndex: 0, message: `Error: ${message}` }));
          setHasStarted(false);
        }
      }, 500);
    } catch (error) {
      console.error('Error starting holder test:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start test. Please try again.';
      dispatch(addMessage({ stepIndex: 0, message: `Error: ${message}` }));
      setHasStarted(false);
    }
  };

  const suggestPolicyFromTr = async () => {
    if (suggestionSnapshot) {
      onTrqpPolicyProfileChange({
        authorization: { ...suggestionSnapshot.authorization },
        recognition: { ...suggestionSnapshot.recognition },
      });
      setSuggestionSnapshot(null);
      setSuggestionError("");
      setSuggestionInfo("Suggestion reverted to previous values.");
      dispatch(addMessage({ stepIndex: 0, message: "TRQP suggestion reverted" }));
      return;
    }

    setIsSuggestingPolicy(true);
    setSuggestionError("");
    setSuggestionInfo("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/trqp/suggest-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        const message = data?.details || data?.error || response.statusText;
        throw new Error(message || "Suggestion failed");
      }

      const suggestion = data?.suggestion || {};
      const authAction = String(suggestion?.authorization?.action || "").trim();
      const authResource = String(suggestion?.authorization?.resource || "").trim();
      const recAction = String(suggestion?.recognition?.action || "").trim();
      const recResource = String(suggestion?.recognition?.resource || "").trim();
      const recCapability = String(suggestion?.recognition?.capability || "").trim();

      setSuggestionSnapshot(cloneTrqpProfile(trqpPolicyProfile));
      onTrqpPolicyProfileChange({
        authorization: {
          action: authAction || trqpPolicyProfile.authorization.action,
          resource: authResource || trqpPolicyProfile.authorization.resource,
        },
        recognition: {
          action: recAction || trqpPolicyProfile.recognition.action,
          resource: recResource || trqpPolicyProfile.recognition.resource,
          capability: recCapability || trqpPolicyProfile.recognition.capability,
        },
      });

      const sourceEndpoint = String(suggestion?.source?.trqpEndpoint || "").trim();
      const suggestedMode = String(suggestion?.mode || "").trim();
      const warnings = Array.isArray(suggestion?.warnings) ? suggestion.warnings.filter(Boolean) : [];
      const infoParts = [
        sourceEndpoint ? `Suggested from ${sourceEndpoint}` : "Suggested from trust registry",
        suggestedMode ? `recommended mode=${suggestedMode}` : "",
      ].filter(Boolean);
      setSuggestionInfo(infoParts.join(" | "));
      if (warnings.length > 0) {
        setSuggestionError(`Suggestion warnings: ${warnings.join(" | ")}`);
      }
      dispatch(addMessage({ stepIndex: 0, message: infoParts.join(" | ") || "TRQP policy suggested from TR" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSuggestionError(`TRQP suggestion failed: ${message}`);
      dispatch(addMessage({ stepIndex: 0, message: `TRQP suggestion failed: ${message}` }));
    } finally {
      setIsSuggestingPolicy(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">Setup Connection</h4>
            <p className="text-blue-800 text-sm">
              This step will establish a connection with your holder wallet and prepare for credential presentation.
            </p>
          </div>
          <TaskDetailsRenderer 
            taskData={taskData}
            buttonClassName="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
        <span className="text-gray-600">
          {isConnected ? 'Connected to backend' : 'Disconnected from backend'}
        </span>
      </div>

      {!hasStarted ? (
        <button
          onClick={() => startConnection(verifyTRQP, trqpMode, trqpPolicyProfile)}
          disabled={!isConnected}
          className="btn btn-blue"
        >
          Start Connection Setup
        </button>
      ) : (
        <div className="text-center py-4">
          {invitationUrl ? (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <h5 className="font-medium mb-2">Scan QR Code</h5>
                <div className="flex justify-center">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(invitationUrl)}`}
                    alt="Connection QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-1">Connection URL:</p>
                  <p className="text-xs font-mono break-all text-gray-600">
                    {invitationUrl}
                  </p>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Scan this QR code with your holder wallet to establish a connection
                </p>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12z"></path>
              </svg>
              <span className="ml-2 text-gray-600">Starting connection setup...</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="inline-flex items-center space-x-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="form-checkbox h-4 w-4 text-blue-600"
            checked={verifyTRQP}
            onChange={(e) => onToggleTRQP(e.target.checked)}
          />
          <span>Verify Trust Registry (TRQP) during presentation</span>
        </label>
        {verifyTRQP && (
          <div className="mt-2 space-y-3">
            <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpMode">
              TRQP Mode
            </label>
            <select
              id="holderTrqpMode"
              value={trqpMode}
              onChange={(e) => onTrqpModeChange(e.target.value as TrqpMode)}
              className="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="authorization">Authorization only</option>
              <option value="recognition">Recognition only</option>
              <option value="both">Both authorization and recognition</option>
            </select>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOverrides((prev) => !prev)}
                  className="text-xs font-medium text-blue-700 hover:text-blue-800"
                >
                  {showAdvancedOverrides ? "Hide Advanced Overrides" : "Show Advanced Overrides"}
                </button>
              </div>
              {showAdvancedOverrides && TRQP_SUGGEST_HELPER_ENABLED && (
                <div className="md:col-span-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={suggestPolicyFromTr}
                    disabled={isSuggestingPolicy}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      isSuggestingPolicy
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {isSuggestingPolicy
                      ? "Loading..."
                      : suggestionSnapshot
                        ? "Revert Suggestion"
                        : "Suggest from TR"}
                  </button>
                  {suggestionInfo && <span className="text-xs text-gray-500">{suggestionInfo}</span>}
                </div>
              )}
              {showAdvancedOverrides && TRQP_SUGGEST_HELPER_ENABLED && suggestionError && (
                <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {suggestionError}
                </div>
              )}
              {showAdvancedOverrides && (trqpMode === "authorization" || trqpMode === "both") && (
                <>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpAuthAction">
                      Authorization Action (optional)
                    </label>
                    <input
                      id="holderTrqpAuthAction"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={trqpPolicyProfile.authorization.action}
                      onChange={(e) =>
                        onTrqpPolicyProfileChange({
                          authorization: {
                            action: e.target.value,
                          },
                        })
                      }
                      placeholder="issue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpAuthResource">
                      Authorization Resource (optional)
                    </label>
                    <input
                      id="holderTrqpAuthResource"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={trqpPolicyProfile.authorization.resource}
                      onChange={(e) =>
                        onTrqpPolicyProfileChange({
                          authorization: {
                            resource: e.target.value,
                          },
                        })
                      }
                      placeholder="ayracard:businesscard"
                    />
                  </div>
                </>
              )}
              {showAdvancedOverrides && (trqpMode === "recognition" || trqpMode === "both") && (
                <>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpRecAction">
                      Recognition Action (optional)
                    </label>
                    <input
                      id="holderTrqpRecAction"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={trqpPolicyProfile.recognition.action}
                      onChange={(e) =>
                        onTrqpPolicyProfileChange({
                          recognition: {
                            action: e.target.value,
                          },
                        })
                      }
                      placeholder="member-of"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpRecResource">
                      Recognition Resource (optional)
                    </label>
                    <input
                      id="holderTrqpRecResource"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={trqpPolicyProfile.recognition.resource}
                      onChange={(e) =>
                        onTrqpPolicyProfileChange({
                          recognition: {
                            resource: e.target.value,
                          },
                        })
                      }
                      placeholder="ayratrustnetwork"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1" htmlFor="holderTrqpRecCapability">
                      Recognition Capability (optional)
                    </label>
                    <input
                      id="holderTrqpRecCapability"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={trqpPolicyProfile.recognition.capability}
                      onChange={(e) =>
                        onTrqpPolicyProfileChange({
                          recognition: {
                            capability: e.target.value,
                          },
                        })
                      }
                      placeholder="issue:ayracard:businesscard"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <MessageRenderer 
        messages={stepMessages} 
        title="Connection Log"
      />
    </div>
  );
}

function PresentationStep({ 
  context, 
  isActive,
  taskData
}: { 
  context: any; 
  isActive: boolean;
  taskData?: TaskNode;
}) {
  const { messages } = useSelector((state: RootState) => state.test);
  
  // Get messages for this step (step 1)
  const stepMessages = messages[1] || [];

  useEffect(() => {
    // Socket events now handled in SocketProvider
    // This component just reacts to Redux state
  }, []);

  if (!isActive) return null;

  // Determine if we're waiting or if proof is being processed
  const isProcessingProof = taskData?.task?.state?.status === 'Running' || taskData?.task?.state?.status === 'Started';
  const isProofCompleted = taskData?.task?.state?.status === 'Accepted' || taskData?.task?.state?.status === 'Completed';

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-green-900 mb-2">Credential Presentation</h4>
            <p className="text-green-800 text-sm">
              Your wallet will receive a presentation request. Please respond with the requested credentials.
            </p>
          </div>
          <TaskDetailsRenderer 
            taskData={taskData}
            buttonClassName="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          />
        </div>
      </div>
      
      <div className="text-center py-4">
        {isProofCompleted ? (
          <div className="inline-flex items-center text-green-600">
            <svg className="h-6 w-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Credential presentation completed successfully!</span>
          </div>
        ) : isProcessingProof ? (
          <div className="inline-flex items-center text-blue-600">
            <svg className="animate-spin h-5 w-5 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12z"></path>
            </svg>
            <span className="font-medium">Processing credential presentation...</span>
          </div>
        ) : (
          <div className="inline-flex items-center">
            <svg className="animate-spin h-5 w-5 text-green-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12z"></path>
            </svg>
            <span className="text-gray-600">Waiting for credential presentation...</span>
          </div>
        )}
      </div>

      <MessageRenderer 
        messages={stepMessages} 
        title="Proof Request Log"
      />
    </div>
  );
}

function ReportStep({ 
  context, 
  isActive, 
  onRestart,
  dagData,
  verifyTRQP = false,
  trqpMode = "both"
}: { 
  context: any; 
  isActive: boolean; 
  onRestart: () => void;
  dagData?: DAGData;
  verifyTRQP?: boolean;
  trqpMode?: TrqpMode;
}) {
  const [showFullReport, setShowFullReport] = useState(false);
  const [testResults, setTestResults] = useState({
    passed: 0,
    failed: 0,
    total: 0
  });

  useEffect(() => {
    if (dagData) {
      const passed = dagData.nodes.filter(
        n =>
          n.task.state.status === "passed" ||
          n.task.state.status === "Accepted" ||
          n.task.state.status === "Completed"
      ).length;
      const failed = dagData.nodes.filter(n => n.task.state.status === "failed" || n.task.state.status === "Error").length;
      setTestResults({
        passed,
        failed,
        total: dagData.nodes.length
      });
    }
  }, [dagData]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "passed":
      case "completed":
        return "text-green-600";
      case "failed":
      case "error":
        return "text-red-600";
      case "running":
      case "started":
        return "text-blue-600";
      default:
        return "text-gray-600";
    }
  };

  if (!isActive) return null;

  const proofNode = dagData?.nodes?.find(
    (n) => n.name?.toLowerCase().includes("proof")
  );
  const hasTrqpError =
    verifyTRQP &&
    !!proofNode?.task?.state?.errors?.some((e: any) =>
      String(e).toLowerCase().includes("trqp")
    );
  const hasTrqpMessage =
    verifyTRQP &&
    !!proofNode?.task?.state?.messages?.some((m: any) =>
      String(m).toLowerCase().includes("trqp")
    );
  const hasTrqpSkipped =
    verifyTRQP &&
    proofNode?.task?.state?.messages?.some((m: any) =>
      String(m).toLowerCase().includes("trqp check skipped")
    );
  const trustStatus = verifyTRQP
    ? hasTrqpError
      ? "failed"
      : hasTrqpSkipped
      ? "skipped"
      : proofNode &&
        (proofNode.finished ||
          proofNode.task.state.runState === "Completed" ||
          proofNode.task.state.status === "Accepted")
      ? "passed"
      : "pending"
    : "skipped";
  const trqpMessages =
    proofNode?.task?.state?.messages?.filter((m: any) =>
      String(m).toLowerCase().includes("trqp")
    ) || [];

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-green-900 mb-2">Test Complete!</h4>
        <p className="text-green-800 text-sm">
          Your holder wallet has successfully completed the conformance test.
        </p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium">Connection</span>
          </div>
          <p className="text-sm text-gray-600">Successfully established</p>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium">Presentation</span>
          </div>
          <p className="text-sm text-gray-600">Credentials verified</p>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium">Compliance</span>
          </div>
          <p className="text-sm text-gray-600">Protocol compliant</p>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-3 h-3 rounded-full ${
                trustStatus === "passed"
                  ? "bg-green-500"
                  : trustStatus === "failed"
                  ? "bg-red-500"
                  : "bg-gray-400"
              }`}
            ></div>
            <span className="font-medium">Trust Registry</span>
          </div>
          <p className="text-sm text-gray-600">
            {trustStatus === "skipped"
              ? "Not requested"
              : trustStatus === "passed"
              ? `TRQP ${trqpModeLabel(trqpMode)} verified`
              : trustStatus === "failed"
              ? "TRQP verification failed"
              : "Awaiting TRQP verification"}
          </p>
        </div>
      </div>

      {/* Detailed Report */}
      {dagData && (
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
            {verifyTRQP && (
              <div className="flex justify-between">
                <span className="font-medium">Trust Registry:</span>
                <span className={`font-medium ${
                  trustStatus === "passed"
                    ? "text-green-600"
                    : trustStatus === "failed"
                    ? "text-red-600"
                    : "text-gray-600"
                }`}>
                  {trustStatus === "passed"
                    ? `TRQP ${trqpModeLabel(trqpMode)} verified`
                    : trustStatus === "failed"
                    ? "TRQP verification failed"
                    : trustStatus === "skipped"
                    ? "Not requested"
                    : "Awaiting TRQP verification"}
                </span>
              </div>
            )}
          </div>

          {/* Full Report */}
          {showFullReport && (
            <div className="mt-6 border-t pt-4">
              <h6 className="font-medium mb-3">Task Details</h6>
              <div className="space-y-4">
                {dagData.nodes.map((node, index) => (
                  <div key={node.id} className="border rounded p-3 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h6 className="font-medium">{node.name}</h6>
                      <span className={`text-sm ${getStatusColor(node.task.state.status)}`}>
                        {node.task.state.status}
                      </span>
                    </div>
                    
                    <div className="mt-4">
                      <h6 className="font-medium text-gray-700 mb-2">Task Details</h6>
                      <div className="text-sm space-y-1">
                        <p><strong>Status:</strong> {node.task.state.status}</p>
                        <p><strong>Run State:</strong> {node.task.state.runState}</p>
                        <p><strong>Finished:</strong> {node.finished ? 'Yes' : 'No'}</p>
                        {node.task.state.messages.length > 0 && (
                          <div>
                            <strong>Messages:</strong>
                            <ul className="list-disc list-inside ml-2 mt-1">
                              {node.task.state.messages.map((msg, idx) => (
                                <li key={idx} className="text-gray-600">{msg}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {node.task.state.warnings.length > 0 && (
                          <div>
                            <strong className="text-yellow-600">Warnings:</strong>
                            <ul className="list-disc list-inside ml-2 mt-1">
                              {node.task.state.warnings.map((warn, idx) => (
                                <li key={idx} className="text-yellow-600">{warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {node.task.state.errors.length > 0 && (
                          <div>
                            <strong className="text-red-600">Errors:</strong>
                            <ul className="list-disc list-inside ml-2 mt-1">
                              {node.task.state.errors.map((err, idx) => (
                                <li key={idx} className="text-red-600">{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {verifyTRQP && node.name?.toLowerCase().includes("proof") && trqpMessages.length > 0 && (
                          <div className="mt-2">
                            <strong>TRQP Messages:</strong>
                            <ul className="list-disc list-inside ml-2 mt-1">
                              {trqpMessages.map((msg, idx) => (
                                <li key={idx} className="text-gray-600">{msg}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Export Report */}
              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => {
                    const reportData = {
                      testName: dagData.metadata.name,
                      testId: dagData.metadata.id,
                      timestamp: new Date().toISOString(),
                      overallStatus: dagData.status,
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
                    a.download = `holder-test-report-${new Date().toISOString().split('T')[0]}.json`;
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
      )}

      <div className="text-center">
        <button
          onClick={onRestart}
          className="btn btn-blue"
        >
          Run Another Test
        </button>
      </div>

      <div className="mt-4">
        <h6 className="font-medium text-gray-700 mb-2">Test Results</h6>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h6 className="text-sm font-medium text-gray-500">Total Tests</h6>
            <p className="text-2xl font-bold text-gray-900">{testResults.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h6 className="text-sm font-medium text-gray-500">Passed</h6>
            <p className="text-2xl font-bold text-green-600">{testResults.passed}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h6 className="text-sm font-medium text-gray-500">Failed</h6>
            <p className="text-2xl font-bold text-red-600">{testResults.failed}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HolderTest() {
  const dispatch = useDispatch();
  const [currentStep, setCurrentStep] = useState(0);
  const [testStatus, setTestStatus] = useState<TestStepStatus>("pending");
  const [showDetailedReport, setShowDetailedReport] = useState(false);
  const [testStartTime, setTestStartTime] = useState<Date | null>(null);
  const [testEndTime, setTestEndTime] = useState<Date | null>(null);
  const [testDuration, setTestDuration] = useState<number | null>(null);
  const defaultTRQP =
    Boolean(process.env.NEXT_PUBLIC_TRQP_KNOWN_ENDPOINT) ||
    Boolean(process.env.NEXT_PUBLIC_TRQP_LOCAL_URL);
  const [verifyTRQP, setVerifyTRQP] = useState(defaultTRQP);
  const [trqpMode, setTrqpMode] = useState<TrqpMode>("both");
  const [trqpPolicyProfile, setTrqpPolicyProfile] = useState<TrqpPolicyProfileInput>({
    authorization: { action: "", resource: "" },
    recognition: { action: "", resource: "", capability: "" },
  });

  // On mount, clear stale holder state and reselect the holder pipeline
  useEffect(() => {
    const prep = async () => {
      try {
        // Ensure backend uses the same card format selected on the home page.
        const stored = window?.localStorage?.getItem("ayra.cardFormat");
        const fmt = stored === "anoncreds" || stored === "w3c" ? stored : "w3c";
        await fetch(`${API_BASE_URL}/api/card-format`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: fmt }),
        }).catch(() => {});
        await fetch(`${API_BASE_URL}/api/select/pipeline?pipeline=HOLDER_TEST`);
      } catch (e) {
        console.warn("Failed to select holder pipeline", e);
      } finally {
        dispatch(resetTest());
        dispatch(clearDAG());
        setCurrentStep(0);
      }
    };
    prep();
  }, [dispatch]);

  // Get DAG state from Redux
  const dagState = useSelector((state: RootState) => state.dag.dag);
  const invitationUrl = useSelector((state: RootState) => state.test.invitationUrl);
  
  // Extract task data and DAG data from Redux state
  const dagData = dagState;
  const taskData = dagState?.nodes || [];
  
  // Simple step progression based on task completion
  useEffect(() => {
    if (!dagData || !dagData.nodes) return;
    
    // Find the highest completed task to determine current step
    let highestCompletedTask = -1;
    let hasRunningTask = false;
    
    for (let i = 0; i < dagData.nodes.length; i++) {
      const node = dagData.nodes[i];
      const taskStatus = node.task.state.status;
      const taskRunState = node.task.state.runState;
      
      // Check if task is running
      if (taskRunState === 'Running' || taskStatus === 'Running' || taskStatus === 'Started') {
        hasRunningTask = true;
      }
      
      // Check if task is completed
      if (taskRunState === 'Completed' || taskStatus === 'Completed' || taskStatus === 'Accepted' || node.finished) {
        highestCompletedTask = i;
      }
    }
    
    // Determine current step - be more conservative about advancing
    let newStep = currentStep;
    
    // If all tasks completed, show report
    if (highestCompletedTask >= 2 || (dagData.status.runState === 'Completed' && dagData.nodes.every(n => n.finished))) {
      newStep = 2;
    }
    // Only advance to presentation step if proof task (task 1) is actually running or completed
    else if (highestCompletedTask >= 1) {
      newStep = 1;
    }
    // OR if task 1 (proof task) is running
    else if (dagData.nodes[1] && (
      dagData.nodes[1].task.state.runState === 'Running' ||
      dagData.nodes[1].task.state.status === 'Running' ||
      dagData.nodes[1].task.state.status === 'Started'
    )) {
      newStep = 1;
    }
    // Stay on connection step even if we have invitation URL - let user see QR first
    
    if (newStep !== currentStep) {
      setCurrentStep(newStep);
    }
    
  }, [dagData, currentStep]);
  
  // Add messages to Redux when DAG updates
  useEffect(() => {
    if (!taskData || taskData.length === 0) return;
    
    taskData.forEach((node, index) => {
      if (node.task.state.messages && node.task.state.messages.length > 0) {
        node.task.state.messages.forEach(message => {
          dispatch(addMessage({ stepIndex: index, message }));
        });
      }
    });
  }, [taskData, dispatch]);

  const getStepStatusFromNode = (node: TaskNode): TestStepStatus => {
    if (!node) return "pending";
    
    const status = (node.task.state.status || "").toLowerCase();
    const runState = (node.task.state.runState || "").toLowerCase();
    
    // Handle various status combinations
    // Important: tasks often set runState=completed even when they fail. Always check failure first.
    if (status === "failed" || status === "error" || runState === "failed" || runState === "error") {
      return "failed";
    }

    if (runState === 'running' || status === 'running' || status === 'started') {
      return "running";
    }
    
    if (status === 'accepted' || status === 'passed') {
      return "passed";
    }
    
    return "pending";
  };

  const steps: (TestStep & { taskData?: TaskNode })[] = [
    {
      id: 0,
      name: "Connection",
      description: "Establish a connection with your holder wallet",
      status: taskData[0] ? getStepStatusFromNode(taskData[0]) : "pending",
      component: (
        <ConnectionStep
          context={{}}
          isActive={currentStep === 0}
          onNext={() => setCurrentStep(1)}
          taskData={taskData[0]}
          verifyTRQP={verifyTRQP}
          onToggleTRQP={setVerifyTRQP}
          trqpMode={trqpMode}
          onTrqpModeChange={setTrqpMode}
          trqpPolicyProfile={trqpPolicyProfile}
          onTrqpPolicyProfileChange={(patch) =>
            setTrqpPolicyProfile((prev) => ({
              authorization: {
                ...prev.authorization,
                ...(patch.authorization || {}),
              },
              recognition: {
                ...prev.recognition,
                ...(patch.recognition || {}),
              },
            }))
          }
        />
      ),
      isActive: currentStep === 0,
      taskData: taskData[0]
    },
    {
      id: 1,
      name: "Presentation",
      description: "Present your credentials to the verifier",
      status: taskData[1] ? getStepStatusFromNode(taskData[1]) : "pending",
      component: <PresentationStep context={{}} isActive={currentStep === 1} taskData={taskData[1]} />,
      isActive: currentStep === 1,
      taskData: taskData[1]
    },
    {
      id: 2,
      name: "Report",
      description: "View the test results and detailed report",
      status:
        dagData &&
        (dagData.nodes || []).some(
          (n) =>
            (n.task.state.status || "").toLowerCase() === "failed" ||
            (n.task.state.status || "").toLowerCase() === "error" ||
            (n.task.state.runState || "").toLowerCase() === "failed" ||
            (n.task.state.runState || "").toLowerCase() === "error"
        )
          ? "failed"
          : dagData && (dagData.status.runState || "").toLowerCase() === "completed"
            ? "passed"
            : "pending",
      component: <ReportStep 
        context={{}} 
        isActive={currentStep === 2} 
        onRestart={() => {
          setCurrentStep(0);
          dispatch(resetTest());
          dispatch(clearDAG());
        }} 
        dagData={dagData || undefined}
        verifyTRQP={verifyTRQP}
        trqpMode={trqpMode}
      />,
      isActive: currentStep === 2
    }
  ];

  return (
    <div>
      <TestRunner
        title="Holder Wallet Conformance Test"
        description="This test verifies if a Holder Wallet can establish a connection and present a credential that was previously issued."
        steps={steps}
        currentStep={currentStep}
        onRestart={() => {
          setCurrentStep(0);
          dispatch(resetTest());
          dispatch(clearDAG());
          fetch(`${API_BASE_URL}/api/select/pipeline?pipeline=HOLDER_TEST`).catch(() => {});
        }}
      />
    </div>
  );
}
