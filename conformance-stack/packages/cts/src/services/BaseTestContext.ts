/**
 * Base Test Context
 * 
 * Common base context that all tests can extend
 */

export type TestStepStatus = "pending" | "running" | "passed" | "failed" | "waiting" | "skipped";

export interface BaseTestContext {
  errors?: {
    [key: string]: string | null;
  };
  reportTimestamp?: string;
}

export interface TestStepController {
  setStatus: (status: TestStepStatus) => void;
  setError: (error: string | null) => void;
  complete: (success: boolean) => void;
  updateContext: (updates: any) => void;
  goToNextStep: () => void;
}

export const createEmptyBaseContext = (): BaseTestContext => ({
  errors: {},
  reportTimestamp: "",
});
