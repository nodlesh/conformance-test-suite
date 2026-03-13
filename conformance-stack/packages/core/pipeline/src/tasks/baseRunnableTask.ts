// src/steps/BaseRunnableTask.ts

import {
  RunnableTask,
  RunnableState,
  TaskState,
  TaskMetadata,
  Results,
} from "../types";
import { v4 as uuidv4 } from "uuid";
import eventBus from "../utils/eventBus"; // Import the event bus

export default class BaseRunnableTask implements RunnableTask {
  public state: TaskState;
  public metadata: TaskMetadata;
  private _process_name = "BaseRunnableTask";
  private _process_id = uuidv4();
  private _onUpdateCallback?: (task: RunnableTask) => void;

  constructor(name: string, description?: string) {
    const id = uuidv4();
    this.metadata = {
      name,
      id,
      description,
    };

    this.state = {
      status: RunnableState.NOT_STARTED,
      runState: RunnableState.NOT_STARTED,
      warnings: [],
      messages: [],
      errors: [],
    };
  }

  serialize() {
    return {
      id: this.metadata.id,
      metadata: this.metadata,
      state: this.state,
    };
  }

  get process_id(): string {
    return this._process_id;
  }

  get process_name(): string {
    return this._process_name;
  }

  async stop() {
    throw new Error("stop doesn't work yet");
  }
  /**
   * Allows installing a callback function to be called whenever the task updates.
   * @param fn The callback function to run on updates.
   */
  onUpdate(fn: (task: RunnableTask) => void): void {
    this._onUpdateCallback = fn;
  }

  // Update state change event using event bus
  protected update() {
    eventBus.emit(this.metadata.id, this.state); // Emit event with task ID as the event name
    if (this._onUpdateCallback) {
      this._onUpdateCallback(this);
    }
  }

  protected setPrepared() {
    this.addMessage(`Task '${this.metadata.name}' is being prepared.`);
    this.state = {
      ...this.state,
      status: RunnableState.STARTED,
      runState: RunnableState.STARTED,
    };
    this.update(); // Emit state change
  }

  // Prepare method (Async)
  async prepare(): Promise<void> {
    this.setPrepared();
  }

  // Adds a message to the state without updating the state directly
  protected addMessage(message: string) {
    this.state = {
      ...this.state,
      messages: [...this.state.messages, message],
    };
    console.log(`[TaskMessage] ${this.metadata.name}: ${message}`);
    this.update();
  }

  protected setRunState(state: RunnableState) {
    this.state = {
      ...this.state,
      runState: state,
    };
    this.update(); // Emit state change
  }

  protected setStatus(state: RunnableState) {
    this.state = {
      ...this.state,
      status: state,
    };
    this.update(); // Emit state change
  }

  setCompleted() {
    this.setRunState(RunnableState.COMPLETED);
  }

  setFailed() {
    this.setStatus(RunnableState.FAILED);
  }

  protected setAccepted() {
    this.setStatus(RunnableState.ACCEPTED);
  }

  protected setRunning() {
    this.addMessage(`Task '${this.metadata.name}' has started running.`);
    this.setRunState(RunnableState.RUNNING);
    this.update();
  }

  protected addError(error: unknown): string[] {
    const message = error instanceof Error ? error.message : String(error);
    const errors = [...this.state.errors, message];
    this.state = {
      ...this.state,
      errors,
    };
    this.update();
    return errors;
  }

  // Run method (Async)
  async run(): Promise<void> {
    this.setRunning();
  }

  // Process results (Async)
  async results(): Promise<Results> {
    return {
      status: this.state.status,
    } as Results;
  }
}
