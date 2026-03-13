// DAG.ts
import { v4 as uuidv4 } from "uuid";
import { TaskRunnerNode, Node } from "../types";
import { Logger, RunnableTask, RunnableState } from "../types";

export type DAGMetadata = {
  name: string;
  id: string;
  description?: string; // Optional description for more context
};

type RunOptions = {
  maxRetries?: number;
  delayMs?: number;
};

type DAGState = {
  status: RunnableState;
  runState: RunnableState;
};

export class DAG {
  private nodes: Set<TaskRunnerNode> = new Set();
  private _metadata: DAGMetadata;
  private logger: Logger;
  private _state: DAGState = {
    status: RunnableState.NOT_STARTED,
    runState: RunnableState.NOT_STARTED,
  };
  private _onUpdateCallback?: (node: DAG) => void;

  constructor(name: string, description?: string, logger?: Logger) {
    this._metadata = {
      name,
      id: uuidv4(),
      ...(description ? { description } : {}),
    };
    this.logger = logger || console;
  }

  get state(): DAGState {
    return this._state;
  }

  get metadata(): DAGMetadata {
    return this._metadata;
  }

  onUpdate(fn: (node: DAG) => void): void {
    this._onUpdateCallback = fn;
  }

  /**
   * Emits the current state of the task, triggering the onUpdate callback if set.
   */
  emit(): void {
    this._onUpdateCallback?.(this);
  }

  /**
   * Adds a node to the DAG.
   * @param node TaskRunnerNode to add.
   * @throws Error if adding the node creates a cycle.
   */
  addNode(node: TaskRunnerNode): void {
    if (this.nodes.has(node)) {
      return; // TaskRunnerNode already exists
    }
    if (this.createsCycle(node)) {
      throw new Error(
        `Adding node "${node.task.metadata.name}" creates a cycle in the DAG.`
      );
    }
    node.onUpdate((_: Node): void => {
      this.emit();
    });

    this.nodes.add(node);
  }

  serialize() {
    return {
      status: this.state,
      metadata: this.metadata,
      nodes: Array.from(this.nodes).map((node: TaskRunnerNode) =>
        node.serialize()
      ),
    };
  }

  /**
   * Checks if adding the given node would create a cycle.
   * @param node TaskRunnerNode to check.
   * @returns boolean indicating if a cycle would be created.
   */
  private createsCycle(node: TaskRunnerNode): boolean {
    const visited = new Set<Node>();

    const dfs = (current: Node): boolean => {
      if (current === node) {
        return true; // Cycle detected
      }
      if (visited.has(current)) {
        return false;
      }
      visited.add(current);
      for (const dep of current.dependencies) {
        if (dfs(dep)) {
          return true;
        }
      }
      return false;
    };

    for (const dep of node.dependencies) {
      if (dfs(dep)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper method to run a node with retry logic.
   * @param node TaskRunnerNode to run.
   * @param maxRetries Maximum number of retry attempts.
   * @param delayMs Delay between retries in milliseconds.
   */
  private async runTaskRunnerNodeWithRetry(
    node: TaskRunnerNode,
    maxRetries: number = 5,
    delayMs: number = 3000
  ): Promise<void> {
    try {
      console.log("Running node: ", node.name, node.id);
      this.state.runState = RunnableState.INITIALIZED;
      await node.init();
      this.logger.info(`Running "${node.task.metadata.name}`);
      this.state.runState = RunnableState.STARTED;
      await node.run({});
      this.state.runState = RunnableState.COMPLETED;
      console.log(`Completed "${node.task.metadata.name}".`);
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Helper method to introduce a delay.
   * @param ms Milliseconds to delay.
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Starts executing the DAG from root nodes.
   */
  async start(opts?: RunOptions): Promise<void> {
    const rootTaskRunnerNodes = this.getRootNodes();
    if (rootTaskRunnerNodes.length === 0) {
      this.logger.info("No root nodes to start the DAG.");
      return;
    }
    await Promise.all(
      rootTaskRunnerNodes.map((node) =>
        this.runTaskRunnerNodeWithRetry(node, opts?.maxRetries, opts?.delayMs)
      )
    );
  }

  /**
   * Retrieves all root nodes (nodes with no dependencies).
   * @returns Array of root TaskRunnerNodes.
   */
  getRootNodes(): TaskRunnerNode[] {
    return Array.from(this.nodes).filter(
      (node) => node.dependencies.size === 0
    );
  }

  /**
   * Retrieves all nodes in the DAG in topological order.
   * @returns Array of TaskRunnerNodes sorted based on dependencies.
   */
  getNodes(): TaskRunnerNode[] {
    const sorted: TaskRunnerNode[] = [];
    const visited = new Set<TaskRunnerNode>();
    const temp = new Set<TaskRunnerNode>();
    const visit = (node: TaskRunnerNode) => {
      if (temp.has(node)) {
        throw new Error("Cycle detected during topological sort.");
      }
      if (!visited.has(node)) {
        temp.add(node);
        if (node.dependencies && node.dependencies.size > 0) {
          node.dependencies.forEach((dep) => visit(dep as TaskRunnerNode));
        }

        temp.delete(node);
        visited.add(node);
        sorted.push(node);
      }
    };
    if (this.nodes.size === 0) {
      return sorted;
    }

    this.nodes.forEach((node) => visit(node));
    return sorted;
  }
}
