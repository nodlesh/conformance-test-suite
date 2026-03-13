import { TaskRunner } from '../types';

export class RequestProofTask implements TaskRunner {
  id: string;
  state: {
    status: string;
    runState: string;
    messages: string[];
  };

  constructor(id: string) {
    this.id = id;
    this.state = {
      status: 'Pending',
      runState: 'Running',
      messages: []
    };
  }

  async run(): Promise<void> {
    try {
      // ... existing code ...
      
      // When task completes
      console.log('RequestProofTask - Task Completion:', {
        taskId: this.id,
        finalState: {
          status: this.state.status,
          runState: this.state.runState
        },
        messages: this.state.messages,
        timestamp: new Date().toISOString()
      });
      
      this.state.status = "Accepted";
      this.state.runState = "Completed";
    } catch (error) {
      console.error('RequestProofTask - Error:', error);
      this.state.status = "Failed";
      this.state.runState = "Error";
      this.state.messages.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 