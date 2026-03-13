interface TaskRunner {
  state: string;
}

export class TaskNode {
  id: string;
  name: string;
  state: string;
  finished: boolean;
  private _task: TaskRunner | null = null;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.state = 'pending';
    this.finished = false;
  }

  set task(task: TaskRunner) {
    console.log('TaskNode - State Update:', {
      nodeId: this.id,
      nodeName: this.name,
      previousState: this.state,
      newTaskState: task.state,
      isFinished: this.finished,
      timestamp: new Date().toISOString()
    });
    this._task = task;
  }

  get task(): TaskRunner | null {
    return this._task;
  }
} 