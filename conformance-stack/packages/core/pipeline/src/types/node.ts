import { RunnableTask, RunnableState, Results } from "./runnableTask";

export type Node = {
  id: string;
  name?: string;
  dependencies: Set<Node>;
  dependents: Set<Node>;
};

export type Runner = {
  init(): Promise<void>;
  run(results?: any): Promise<void>;
  stop(): Promise<void>;
  onUpdate(fn: (node: Node) => void): void;
  finished: boolean;
  state: RunnableState;
  serialize(): any;
};

export type RunnerNode = Node & Runner;

export type TaskRunnerNode = RunnerNode & {
  task: RunnableTask;
};
