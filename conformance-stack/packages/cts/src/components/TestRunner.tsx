import React from "react";
import { TaskNode } from "@/types/DAGNode";

export type TestStepStatus = "pending" | "running" | "passed" | "failed" | "waiting" | "skipped";

export interface TestStep {
  id: number;
  name: string;
  description: string;
  status: TestStepStatus;
  component: React.ReactNode;
  isActive: boolean;
  taskData?: TaskNode;
  labelTop?: string;
  labelBottom?: string;
}

interface TestRunnerProps {
  title: string;
  description: string;
  steps: TestStep[];
  currentStep: number;
  onStepChange?: (stepIndex: number) => void;
  onRestart?: () => void;
}

export function TestRunner({
  title,
  description,
  steps,
  currentStep,
  onStepChange,
  onRestart
}: TestRunnerProps) {
  const hasTopLabels = steps.some((step) => step.labelTop);
  const compactStepper = hasTopLabels && steps.length >= 10;
  const phaseSegments = React.useMemo(() => {
    if (!hasTopLabels) {
      return [];
    }
    const segments: { label: string; count: number }[] = [];
    steps.forEach((step) => {
      let phase = step.labelTop;
      if (!phase) {
        const lower = step.name.toLowerCase();
        if (lower.includes("setup")) {
          phase = "Setup";
        } else if (lower.includes("report")) {
          phase = "Report";
        } else {
          phase = "Flow";
        }
      }
      const last = segments[segments.length - 1];
      if (last && last.label === phase) {
        last.count += 1;
      } else {
        segments.push({ label: phase, count: 1 });
      }
    });
    return segments;
  }, [hasTopLabels, steps]);
  const getStepVisual = (step: TestStep, index: number) => {
    if (step.status === "failed") {
      return { className: "bg-red-500 text-white", label: "✗" };
    }
    if (step.status === "passed") {
      return { className: "bg-green-500 text-white", label: "✓" };
    }
    if (step.status === "skipped") {
      return { className: "bg-gray-400 text-white", label: "–" };
    }
    if (step.status === "waiting") {
      return { className: "border-2 border-blue-400 text-blue-600 bg-white", label: "…" };
    }
    if (step.status === "running") {
      return { className: "bg-blue-500 text-white", label: "•" };
    }
    if (index === currentStep) {
      return { className: "bg-blue-500 text-white", label: index + 1 };
    }
    return { className: "bg-white border-2 border-gray-300 text-gray-500", label: index + 1 };
  };

  return (
    <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <p className="text-gray-700 mb-6">{description}</p>
      
      {/* Progress indicator */}
      <div className="mb-8 overflow-x-auto">
        <div className={compactStepper ? "min-w-[1024px]" : ""}>
          {phaseSegments.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2">
                {phaseSegments.map((segment, index) => (
                  <div
                    key={`${segment.label}-${index}`}
                    className="rounded-full bg-gray-100 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-600 text-center"
                    style={{ flex: segment.count }}
                  >
                    {segment.label}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="h-1 w-full bg-gray-200 rounded"></div>
            </div>
            <div className="relative flex justify-between">
              {steps.map((step, index) => {
                const visual = getStepVisual(step, index);
                return (
                  <div
                    key={step.id}
                    className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${visual.className}`}
                  >
                    {visual.label}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className={`mt-4 flex justify-between ${hasTopLabels ? "text-gray-600" : "text-gray-500"} text-xs`}>
            {steps.map((step) => {
              const labelBottom = step.labelBottom ?? step.name;
              if (!hasTopLabels) {
                return (
                  <div key={step.id} className="w-24 text-center overflow-hidden text-ellipsis whitespace-nowrap">
                    {labelBottom}
                  </div>
                );
              }
              return (
                <div key={step.id} className="flex-1 min-w-0 px-1 text-center">
                  <div className="text-[11px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {labelBottom}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Current step info */}
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-2">{steps[currentStep]?.name}</h3>
        <p className="text-gray-600">{steps[currentStep]?.description}</p>
      </div>
      
      {/* Current step content */}
      <div className="border-t pt-4">
        {steps[currentStep]?.component}
      </div>
      
      {/* Restart button (shown only when test is finished) */}
      {onRestart && currentStep === steps.length - 1 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={onRestart}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Start New Test
          </button>
        </div>
      )}
    </div>
  );
}
