import { BaseNode } from "./baseNode";

describe("BaseNode", () => {
  let node: BaseNode;

  beforeEach(() => {
    node = new BaseNode();
  });

  it("should generate a unique id upon creation", () => {
    expect(node.id).toBeDefined();
    expect(typeof node.id).toBe("string");
  });

  it("should register an onUpdate callback and call it when emit is called", () => {
    const mockCallback = jest.fn();
    node.onUpdate(mockCallback);

    node.emit(); // Trigger the emit to call onUpdate
    expect(mockCallback).toHaveBeenCalledWith(node); // Ensure callback is called with the node instance
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("should add a dependency and update dependents", () => {
    const dependency = new BaseNode();

    node.addDependency(dependency);

    expect(node.dependencies.has(dependency)).toBe(true);
    expect(dependency.dependents.has(node)).toBe(true);
  });

  it("should throw an error if a node adds itself as a dependency", () => {
    expect(() => node.addDependency(node)).toThrowError(
      "A node cannot depend on itself."
    );
  });

  it("should detect a cycle when adding a dependency", () => {
    const nodeA = new BaseNode();
    const nodeB = new BaseNode();
    const nodeC = new BaseNode();

    nodeA.addDependency(nodeB); // A depends on B
    nodeB.addDependency(nodeC); // B depends on C

    // Adding C as a dependency of A should throw a cycle error
    expect(() => nodeC.addDependency(nodeA)).toThrowError(
      `Adding dependency "${nodeA.id}" creates a cycle in the DAG.`
    );
  });

  it("should not detect a cycle when adding non-cyclic dependencies", () => {
    const nodeA = new BaseNode();
    const nodeB = new BaseNode();

    // A depends on B
    nodeA.addDependency(nodeB);

    expect(nodeA.dependencies.has(nodeB)).toBe(true);
    expect(nodeB.dependents.has(nodeA)).toBe(true);
  });

  it("should emit an update when a dependency is added", () => {
    const mockCallback = jest.fn();
    node.onUpdate(mockCallback);

    const dependency = new BaseNode();
    node.addDependency(dependency);

    node.emit();
    expect(mockCallback).toHaveBeenCalledWith(node);
  });

  it("should not detect a cycle for an independent node", () => {
    const nodeA = new BaseNode();
    const nodeB = new BaseNode();

    // Adding B as a dependency of A should not throw an error (no cycle)
    expect(() => nodeA.addDependency(nodeB)).not.toThrow();
    expect(nodeA.dependencies.has(nodeB)).toBe(true);
  });
});
