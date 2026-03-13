import { TaskNode } from "./taskNode";
import BaseRunnableTask from "../tasks/baseRunnableTask";
import eventBus from "../utils/eventBus";

jest.mock("../utils/eventBus"); // Mock the event bus

describe("TaskNode", () => {
  let taskNode: TaskNode;

  beforeEach(() => {
    taskNode = new TaskNode(
      new BaseRunnableTask("Test Task", "This is a test task.")
    );
    jest.clearAllMocks(); // Clear any previous calls to mocks
  });

  it("should initialize with a wrapped BaseRunnableTask", () => {
    expect(taskNode.task).toBeInstanceOf(BaseRunnableTask);
    expect(taskNode.task.metadata.name).toBe("Test Task");
    expect(taskNode.task.metadata.description).toBe("This is a test task.");
  });

  it("should initialize the task if dependencies are complete", async () => {
    jest.spyOn(taskNode, "areDependenciesComplete").mockReturnValue(true); // Simulate dependencies complete
    const prepareSpy = jest.spyOn(taskNode.task, "prepare");

    await taskNode.init();

    expect(taskNode.areDependenciesComplete).toHaveBeenCalled();
    expect(prepareSpy).toHaveBeenCalled();
  });

  it("should throw an error when initializing with incomplete dependencies", async () => {
    jest.spyOn(taskNode, "areDependenciesComplete").mockReturnValue(false); // Simulate incomplete dependencies

    await expect(taskNode.init()).rejects.toThrowError(
      "Dependencies are not complete. Cannot initialize."
    );
  });

  it("should run the task if dependencies are complete", async () => {
    jest.spyOn(taskNode, "areDependenciesComplete").mockReturnValue(true); // Simulate dependencies complete
    const runSpy = jest.spyOn(taskNode.task, "run");

    await taskNode.run();

    expect(taskNode.areDependenciesComplete).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();
    expect(taskNode.finished).toBe(false); // Since the task never transitions to COMPLETED
  });

  it("should throw an error when running with incomplete dependencies", async () => {
    jest.spyOn(taskNode, "areDependenciesComplete").mockReturnValue(false); // Simulate incomplete dependencies

    await expect(taskNode.run()).rejects.toThrowError(
      "Dependencies are not complete. Cannot run."
    );
  });

  it("should emit state change through the onUpdate callback", () => {
    const mockCallback = jest.fn();

    // Set the onUpdate callback for the wrapped task
    taskNode.task.onUpdate(mockCallback);
    taskNode.task.run();

    // Ensure the callback was triggered with the correct task object
    expect(mockCallback).toHaveBeenCalledWith(taskNode.task);
    expect(eventBus.emit).toHaveBeenCalledWith(
      taskNode.task.metadata.id,
      taskNode.task.state
    );
  });

  it("should notify dependents after running the task", async () => {
    const dependentTaskNode = new TaskNode(
      new BaseRunnableTask("Dependent Task")
    );
    taskNode.dependents.add(dependentTaskNode);
    jest
      .spyOn(dependentTaskNode, "areDependenciesComplete")
      .mockReturnValue(true);
    const initSpy = jest.spyOn(dependentTaskNode, "init");
    const runSpy = jest.spyOn(dependentTaskNode, "run");

    jest.spyOn(taskNode, "areDependenciesComplete").mockReturnValue(true); // Simulate dependencies complete
    await taskNode.run();

    expect(initSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();
  });
});
