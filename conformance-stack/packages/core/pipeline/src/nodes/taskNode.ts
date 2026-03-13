// TaskNode.ts

import { RunnableTask, RunnableState, RunnerNode } from "../types";
import { BaseNode } from "./baseNode";

type RunOptions = {
  maxRetries?: number;
  delayMs?: number;
};

export class TaskNode extends BaseNode implements RunnerNode {
  private _task: RunnableTask;
  private _finished = false;
  private _stopped = false;
  private _name?: string;
  private _description?: string;

  constructor(task: RunnableTask, name?: string, description?: string) {
    super();
    this._task = task;
    this._name = name;
    this._description = description;
    this._task.onUpdate((_: RunnableTask): void => {
      this.emit();
    });
  }

  get state(): RunnableState {
    return this._task.state.runState;
  }
  get task(): RunnableTask {
    return this._task;
  }

  get name(): string {
    return this._name || this._task.metadata.name;
  }

  get description(): string {
    return this._description || this._task.metadata.description || "";
  }

  get finished(): boolean {
    return this._finished;
  }

  get stopped(): boolean {
    return this._stopped;
  }

  serialize(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      state: this.state,
      finished: this.finished,
      stopped: this.stopped,
      task: this.task.serialize(),
    };
  }

  /**
   * Initializes the task by preparing it if dependencies are complete.
   * Throws an error if dependencies are not complete.
   */
  async init(): Promise<void> {
    if (!this.areDependenciesComplete()) {
      throw new Error("Dependencies are not complete. Cannot initialize.");
    }
    await this._task.prepare();
  }

  /**
   * Runs the task if all dependencies are complete.
   * After running, it notifies all dependents.
   * Throws an error if dependencies are not complete.
   */

  async run(input: any, options?: RunOptions): Promise<void> {
    const { maxRetries = 1, delayMs = 3000 } = options || {}; // Set default values

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.areDependenciesComplete()) {
          throw new Error("Dependencies are not complete. Cannot run.");
        }
        console.log(`Running task with input:`, input);

        await this._task.run(input);
        //        this._finished = this._task.state.runState === RunnableState.COMPLETED;

        // If the task completes successfully, exit the loop
        break;
      } catch (e) {
        console.error(`Error on attempt ${attempt} for task:`, e);
        if (attempt < maxRetries) {
          console.log(`Retrying in ${delayMs} ms...`);
          await this.delay(delayMs); // Wait before retrying
        } else {
          throw e; // Rethrow the error to propagate it
        }
      }
    }
    this._finished = this._task.state.runState === RunnableState.COMPLETED;
    await this.notifyDependents(); // Notify dependents after successful execution
  }

  /**
   * Helper method to introduce a delay.
   * @param ms Milliseconds to delay.
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stops the task, which can include custom cleanup logic.
   */
  async stop(): Promise<void> {
    console.log(`Stopping task ${this._task.metadata.name}.`);
    this._stopped = true;
    this._task.stop();
    // send signal to task
  }

  /**
   * Checks if all dependencies of this node are complete.
   * Returns true if all dependencies are marked as finished.
   */
  areDependenciesComplete(): boolean {
    return Array.from(this.dependencies).every(
      (dep) => (dep as RunnerNode).finished
    );
  }

  /**
   * Notifies all dependents that this task has completed by running them concurrently.
   */
  private async notifyDependents(): Promise<void> {
    try {
      // Fetch the results once
      const results = await this._task.results();

      // Map each dependent to its execution promise
      const dependentPromises = Array.from(this.dependents).map(
        async (dependent) => {
          const evalTask = (dependent as any).task as RunnableTask;

          // Ensure evalTask has a results method and invoke it if necessary
          if (
            typeof evalTask === "object" &&
            evalTask &&
            typeof evalTask.results === "function"
          ) {
            await evalTask.results();
          }

          // Initialize the dependent task
          await (dependent as TaskNode).init();

          // Check if all dependencies are complete before running
          if ((dependent as TaskNode).areDependenciesComplete()) {
            console.log(
              `Running dependent task: ${
                (dependent as TaskNode).task.metadata.name
              }`
            );
            await (dependent as TaskNode).run(results?.value);
          }
        }
      );

      // Execute all dependent tasks concurrently
      const settledResults = await Promise.allSettled(dependentPromises);

      // Handle the outcomes
      settledResults.forEach((settledResult, index) => {
        const dependent = Array.from(this.dependents)[index];
        const dependentName = (dependent as TaskNode).task.metadata.name;

        if (settledResult.status === "fulfilled") {
          console.log(
            `Dependent task "${dependentName}" completed successfully.`
          );
        } else {
          console.error(
            `Dependent task "${dependentName}" failed with error:`,
            settledResult.reason
          );
        }
      });
    } catch (e) {
      console.error("Failed to notify dependents:", e);
      // Depending on your application's needs, you might want to handle this differently
      throw e;
    }
  }
}
