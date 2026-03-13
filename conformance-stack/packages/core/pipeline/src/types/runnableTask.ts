export type Results = {
  time?: Date;
  value?: any;
  error?: Error;
  author?: string;
};

export type TaskState = {
  status: RunnableState;
  runState: RunnableState;
  warnings: string[];
  errors: string[];
  messages: string[];
};

export type RunnableTask = {
  state: TaskState;
  metadata: TaskMetadata;
  process_id: string;
  process_name: string;
  onUpdate(fn: (task: RunnableTask) => void): void;
  prepare(): Promise<void>;
  run(input: any): Promise<void>;
  results(): Promise<Results>;
  stop(): Promise<void>;
  serialize(): any;
};

export type TaskMetadata = {
  name: string;
  id: string;
  description?: string; // Optional description for more context
  image?: string; // Optional picture for visual representation
};

export enum RunnableState {
  NOT_STARTED = "Not Started",
  INITIALIZED = "Initialized", // Added "Initialized" state to the RunnableState enum
  STARTED = "Started",
  PASSED = "Passed",
  RUNNING = "Running",
  COMPLETED = "Completed",
  ACCEPTED = "Accepted",
  PENDING = "Pending",
  READY = "Ready",
  FAILED = "Failed",
  PLANNING = "Planning",
  PREPARED = "Prepared",
}
