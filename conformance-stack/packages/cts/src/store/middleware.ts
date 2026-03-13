import { Middleware } from '@reduxjs/toolkit';
import { RootState } from './index';
import { setCurrentStep, completeTest, addMessage } from './testSlice';
import { DAG } from '@/types/DAGNode';

// Middleware to handle automatic test progression based on DAG state
export const testProgressionMiddleware: Middleware = 
  (store) => (next) => (action) => {
    const result = next(action);
    
    // Only react to DAG updates
    if ((action as { type: string }).type === 'dag/setDAG') {
      const state = store.getState() as RootState;
      const dag: DAG = (action as { payload: DAG }).payload;
      const { isTestRunning, currentStep } = state.test;
      
      // Only process if test is running
      if (!isTestRunning || !dag.nodes || dag.nodes.length === 0) {
        return result;
      }

      const dagName = (dag.metadata?.name || '').toLowerCase();
      const isVerifierFlow = dagName.includes('verifier') || dag.nodes.length >= 4;
      const nodeStepOffset = isVerifierFlow ? 1 : 0;

      console.log('TestProgressionMiddleware: Processing DAG update', {
        currentStep,
        nodeCount: dag.nodes.length,
        isVerifierFlow,
        nodes: dag.nodes.map(n => ({
          name: n.name,
          status: n.task.state.status,
          runState: n.task.state.runState,
          finished: n.finished
        }))
      });

      // Add messages from DAG nodes to corresponding test steps
      dag.nodes.forEach((node, index) => {
        if (node.task.state.messages.length > 0) {
          node.task.state.messages.forEach(message => {
            store.dispatch(addMessage({ stepIndex: index + nodeStepOffset, message }));
          });
        }
      });

      const isFailedNode = (node: DAG["nodes"][number]) => {
        const status = (node.task.state.status || '').toLowerCase();
        const runState = (node.task.state.runState || '').toLowerCase();
        return (
          status === 'failed' ||
          status === 'error' ||
          runState === 'failed' ||
          runState === 'error'
        );
      };

      // Determine the new step based on DAG state
      let newStep = currentStep;

      // Report step index:
      // - Verifier UI has a "Setup Test" step at index 0, then 1..N for DAG nodes, then report at N+1.
      // - Holder UI uses a fixed report step at index 2.
      const reportStepIndex = isVerifierFlow ? dag.nodes.length + nodeStepOffset : 2;
      
      // Check if all nodes are completed -> go to report step
      const allNodesCompleted = dag.nodes.every((node) => {
        const status = (node.task.state.status || '').toLowerCase();
        const runState = (node.task.state.runState || '').toLowerCase();
        return (
          (status === 'accepted' || status === 'passed') &&
          (runState === 'completed' || node.finished)
        );
      });
      
      if (allNodesCompleted) {
        console.log('TestProgressionMiddleware: All nodes completed, moving to report');
        newStep = reportStepIndex;
        store.dispatch(completeTest());
      } else {
        const firstFailedNodeIndex = dag.nodes.findIndex(isFailedNode);
        if (firstFailedNodeIndex !== -1) {
          newStep = firstFailedNodeIndex + nodeStepOffset;
          console.log('TestProgressionMiddleware: Found failed node at index', firstFailedNodeIndex);
        } else {
        // Find the first running node
          const firstRunningNodeIndex = dag.nodes.findIndex(node => 
            (node.task.state.runState || '').toLowerCase() === 'running' || 
            (node.task.state.status || '').toLowerCase() === 'running' ||
            (node.task.state.status || '').toLowerCase() === 'started'
          );
          
          if (firstRunningNodeIndex !== -1) {
            newStep = firstRunningNodeIndex + nodeStepOffset;
            console.log('TestProgressionMiddleware: Found running node at index', firstRunningNodeIndex);
          } else {
            // Find the last completed node and move to next step
            const completedNodeCount = dag.nodes.filter(node => 
              (node.task.state.status || '').toLowerCase() === 'accepted' || 
              (node.task.state.status || '').toLowerCase() === 'passed'
            ).length;
            
            if (completedNodeCount > 0) {
              // Move to the step after the last completed one, but not beyond report step
              newStep = Math.min(completedNodeCount + nodeStepOffset, reportStepIndex);
              console.log('TestProgressionMiddleware: Completed nodes:', completedNodeCount, 'new step:', newStep);
            }
          }
        }
      }

      // Update step if it changed
      if (newStep !== currentStep) {
        console.log('TestProgressionMiddleware: Step transition:', currentStep, '→', newStep);
        store.dispatch(setCurrentStep(newStep));
      }
    }
    
    return result;
  };
