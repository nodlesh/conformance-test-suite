// __mocks__/MockTaskRunnerNode.ts

import { RunnerNode, Results, RunnableTask, RunnableState } from "../types";
import { BaseNode } from "../nodes/baseNode";

export class MockTaskRunnerNode extends BaseNode implements RunnerNode {
  task: RunnableTask;
  finished: boolean = false;
  private storedResult: Results | null = null;

  constructor(taskName: string, description?: string) {
    super();
    this.task = {
      metadata: {
        name: taskName,
        id: "", // Will be set by uuidv4 mock
        description,
      },
      state: {
        status: RunnableState.NOT_STARTED,
        runState: RunnableState.NOT_STARTED,
        warnings: [],
        errors: [],
        messages: [],
      },
      stop: jest.fn(),
      process_id: "",
      process_name: "MockRunnableTask",
      onUpdate: jest.fn(),
      prepare: jest.fn().mockResolvedValue(undefined),
      run: jest.fn(),
      results: jest.fn().mockResolvedValue({ status: RunnableState.PASSED }),
    };
  }
  setResult = (result: Results) => {
    this.storedResult = result;
    this.task.results = jest.fn(async () => this.storedResult as Results);
  };

  get state(): RunnableState {
    return this.task.state.runState;
  }

  async init(): Promise<void> {
    await this.task.prepare();
  }

  async run(): Promise<void> {
    await this.task.run();
    this.finished = this.task.state.runState === RunnableState.COMPLETED;
  }

  async stop(): Promise<void> {
    console.log("stopping node...");
    return;
  }
}
