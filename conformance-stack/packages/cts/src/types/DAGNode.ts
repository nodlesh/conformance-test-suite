export interface TaskNode {
  id: string;
  name: string;
  description: string;
  state: string;
  finished: boolean;
  stopped: boolean;
  task: {
    id: string;
    metadata: {
      name: string;
      id: string;
      description: string;
    };
    state: {
      status: string;
      runState: string;
      warnings: string[];
      messages: string[];
      errors: string[];
    };
  };
}

export interface DAG {
  status: {
    status: string;
    runState: string;
  };
  metadata: {
    name: string;
    id: string;
  };
  nodes: TaskNode[];
}
