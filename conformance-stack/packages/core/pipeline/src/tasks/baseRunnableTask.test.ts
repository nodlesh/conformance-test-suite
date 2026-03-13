import BaseRunnableTask from "./baseRunnableTask";
import { RunnableState, Results } from "../types";
import eventBus from "../utils/eventBus"; // Mock the event bus

jest.mock("../utils/eventBus");

describe("BaseRunnableTask", () => {
  let task: BaseRunnableTask;

  beforeEach(() => {
    task = new BaseRunnableTask("Test Task", "This is a test task.");
    jest.clearAllMocks(); // Clear previous event bus mock calls
  });

  it("should initialize with correct metadata and initial state", () => {
    expect(task.metadata.name).toBe("Test Task");
    expect(task.metadata.description).toBe("This is a test task.");
    expect(task.state.status).toBe(RunnableState.NOT_STARTED);
    expect(task.state.runState).toBe(RunnableState.NOT_STARTED);
    expect(task.state.messages.length).toBe(0);
  });

  it("should prepare the task and update the state to started", async () => {
    await task.prepare();
    expect(task.state.status).toBe(RunnableState.STARTED);
    expect(task.state.runState).toBe(RunnableState.STARTED);
    expect(task.state.messages).toContain(
      "Task 'Test Task' is being prepared."
    );
    expect(eventBus.emit).toHaveBeenCalledWith(task.metadata.id, task.state);
  });

  it("should run the task and update the state to running", async () => {
    await task.run();
    expect(task.state.runState).toBe(RunnableState.RUNNING);
    expect(task.state.messages).toContain(
      "Task 'Test Task' has started running."
    );
    expect(eventBus.emit).toHaveBeenCalledTimes(3); // For RUNNING state change
  });

  it("should call onUpdate callback when state changes", async () => {
    const onUpdateCallback = jest.fn();
    task.onUpdate(onUpdateCallback);

    await task.prepare();
    expect(onUpdateCallback).toHaveBeenCalledWith(task);

    await task.run();
    expect(onUpdateCallback).toHaveBeenCalledTimes(5); // For PREPARE and RUN state changes
  });

  it("should not complete or accept the task when run", async () => {
    await task.run();
    expect(task.state.runState).toBe(RunnableState.RUNNING);
    expect(task.state.status).not.toBe(RunnableState.COMPLETED);
    expect(task.state.status).not.toBe(RunnableState.ACCEPTED);
  });
});
