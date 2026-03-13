import React from "react";
import { BaseTask as Task, TestStep } from "./BaseTask";
import RenderQRCode from "@/components/RenderQRCode";

export interface TaskRunnerProps {
    id?: number;
    name?: string;
    description?: string;
    steps: TestStep[];
}

export default function TaskRunner({
    id = 1,
    name = "Test Ayra Network Employee Credential Verification",
    description = "A test verifying the wallet’s ability to handle proof requests. Please scan the QR code in the appropriate step to initialize the connection.",
    steps,
}: TaskRunnerProps) {
    return (
        <div className="min-h-screen py-8">
            <Task id={id} name={name} description={description} steps={steps} />
        </div>
    );
}
