// This file defines the TaskRunner interface used to represent executable tasks
// with a unique identifier and runtime state. Each task provides a `run` method
// to perform its associated work asynchronously.
export interface TaskRunner {
  id: string;
  state: {
    status: string;
    runState: string;
    messages: string[];
  };
  run(): Promise<void>;
} 