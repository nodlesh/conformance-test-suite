import { useState, ReactNode } from "react";

export type TestState = "Not Started" | "Started" | "Running" | "Done";
export type StepStatus = "pending" | "running" | "passed" | "failed";

export interface TestStep {
    id: number;
    name: string;
    description: string;
    status: StepStatus;
    /** Optional extra content to render for this step */
    content?: ReactNode;
}

export interface TaskProps {
    id: number;
    name: string;
    description: string;
    initialState?: TestState;
    steps: TestStep[];
}

export function BaseTask({
    id,
    name,
    description,
    initialState = "Not Started",
    steps: initialSteps,
}: TaskProps) {
    const [state, setState] = useState<TestState>(initialState);
    const [steps, setSteps] = useState<TestStep[]>(initialSteps);

    const startTask = () => {
        if (state === "Not Started") {
            setState("Started");
        }
    };

    const runSteps = async () => {
        if (state === "Started") {
            setState("Running");
            // Simulate asynchronous execution by updating each step randomly
            const updatedSteps = steps.map((step) => {
                const passed = Math.random() > 0.5;
                return { ...step, status: passed ? "passed" as StepStatus : "failed" as StepStatus };
            });
            setSteps(updatedSteps);
            setState("Done");
        }
    };

    return (
        <div className="max-w-xl mx-auto bg-white shadow p-6 mt-6 rounded-md">
            <h2 className="text-2xl font-bold mb-2">{name}</h2>
            <p className="text-gray-700 mb-4">{description}</p>

            <div className="mb-4">
                <strong>Task State:</strong> {state}
            </div>
            <div className="space-x-2">
                {state === "Not Started" && (
                    <button
                        onClick={startTask}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    >
                        Start Task
                    </button>
                )}
                {state === "Started" && (
                    <button
                        onClick={runSteps}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
                    >
                        Run Steps
                    </button>
                )}
            </div>
            <ul className="mt-6 space-y-2">
                {steps.map((step) => (
                    <li
                        key={step.id}
                        className="border border-gray-300 p-3 rounded"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-semibold">{step.name}</p>
                                <p className="text-sm text-gray-600">
                                    {step.description}
                                </p>
                            </div>
                            <span
                                className={
                                    step.status === "passed"
                                        ? "text-green-600"
                                        : step.status === "failed"
                                          ? "text-red-600"
                                          : step.status === "running"
                                            ? "text-blue-600"
                                            : "text-gray-600"
                                }
                            >
                                {step.status.toUpperCase()}
                            </span>
                        </div>
                        {step.content && (
                            <div className="mt-4">{step.content}</div>
                        )}
                    </li>
                ))}
            </ul>
            {state === "Done" && (
                <div className="mt-6 p-4 border border-green-300 rounded bg-green-50">
                    <h3 className="text-lg font-bold mb-2 text-green-700">
                        Task Completed!
                    </h3>
                    <p className="text-green-700">Review the results above.</p>
                </div>
            )}
        </div>
    );
}
