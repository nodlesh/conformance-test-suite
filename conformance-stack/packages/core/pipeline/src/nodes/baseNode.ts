// BaseNode.ts
import { v4 as uuidv4 } from "uuid";
import { Node } from "../types";

export class BaseNode implements Node {
  dependencies: Set<Node> = new Set();
  dependents: Set<Node> = new Set();
  isReadyToRun: boolean = false;

  private _id: string;
  private _onUpdateCallback?: (node: Node) => void;

  constructor() {
    this._id = uuidv4();
  }

  get id(): string {
    return this._id;
  }

  /**
   * Register a callback function to be called when the node is updated.
   */
  onUpdate(fn: (node: Node) => void): void {
    this._onUpdateCallback = fn;
  }
  /**
   * Add a dependency to this node.
   * Throws an error if adding the dependency creates a cycle.
   */
  addDependency(node: Node): void {
    if (node === this) {
      throw new Error("A node cannot depend on itself.");
    }
    if (this.createsCycle(node)) {
      throw new Error(
        `Adding dependency "${node.id}" creates a cycle in the DAG.`
      );
    }

    this.dependencies.add(node);
    node.dependents.add(this);
  }

  /**
   * Emits the current state of the task, triggering the onUpdate callback if set.
   */
  emit(): void {
    this._onUpdateCallback?.(this);
  }

  /**
   * Checks if adding a dependency would create a cycle in the graph.
   */
  private createsCycle(node: Node): boolean {
    return this.detectCycle(node, new Set<Node>());
  }

  /**
   * Helper function to detect cycles using Depth-First Search (DFS).
   */
  private detectCycle(node: Node, visited: Set<Node>): boolean {
    const dfs = (current: Node): boolean => {
      if (current === this) return true; // Cycle detected
      if (visited.has(current)) return false;

      visited.add(current);
      for (const dep of current.dependencies) {
        if (dfs(dep)) return true;
      }
      return false;
    };

    return dfs(node);
  }
}
